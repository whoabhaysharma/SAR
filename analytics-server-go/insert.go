package main

import (
	"context"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/nats-io/nats.go"
)

func startWorkers(ctx context.Context, cfg Config, js nats.JetStreamContext, nc *nats.Conn, m *metrics) {
	for i := 0; i < cfg.FlushWorkers; i++ {
		go func(id int) {
			runWorker(ctx, id, cfg, js, nc, m)
		}(i)
	}
	log.Printf("[workers] started %d workers", cfg.FlushWorkers)
}

func runWorker(ctx context.Context, id int, cfg Config, js nats.JetStreamContext, nc *nats.Conn, m *metrics) {
	conn, err := newCHConn(cfg)
	if err != nil {
		log.Printf("[w%d] connect: %v", id, err)
		return
	}
	defer conn.Close()

	sub, err := js.PullSubscribe(jetStreamSubject, jetStreamConsumer)
	if err != nil {
		log.Printf("[w%d] subscribe: %v", id, err)
		return
	}
	defer sub.Unsubscribe()

	// Dedup: track recently seen stream sequence numbers
	seen := make(map[uint64]struct{})
	var seenOrder []uint64

	batch := make([]AnalyticsEvent, 0, cfg.BatchSize)
	acks := make([]*nats.Msg, 0, cfg.BatchSize)

	for {
		if len(batch) >= cfg.BatchSize {
			flushToClickHouse(conn, cfg, batch, m)
			ackMessages(acks, nc, m)
			batch = batch[:0]
			acks = acks[:0]
		}

		need := cfg.BatchSize - len(batch)
		msgs, err := sub.Fetch(need, nats.MaxWait(time.Duration(cfg.BatchIntervalMs)*time.Millisecond))
		if err == nats.ErrTimeout {
			if len(batch) > 0 {
				flushToClickHouse(conn, cfg, batch, m)
				ackMessages(acks, nc, m)
				batch = batch[:0]
				acks = acks[:0]
			}
			select {
			case <-ctx.Done():
				goto drain
			default:
				continue
			}
		}
		if err != nil {
			log.Printf("[w%d] fetch: %v", id, err)
			select {
			case <-ctx.Done():
				goto drain
			default:
				time.Sleep(100 * time.Millisecond)
				continue
			}
		}

		m.pending.Add(int64(len(msgs)))
		for _, msg := range msgs {
			// Extract stream sequence from reply subject for dedup
			sseq := extractSeq(msg.Reply)
			if sseq > 0 {
				if _, dup := seen[sseq]; dup {
					msg.Respond(nil)
					nc.Flush()
					m.pending.Add(int64(-1))
					continue
				}
				seen[sseq] = struct{}{}
				seenOrder = append(seenOrder, sseq)
				if len(seenOrder) > 10000 {
					delete(seen, seenOrder[0])
					seenOrder = seenOrder[1:]
				}
			}

			var ev AnalyticsEvent
			if ev.UnmarshalBinary(msg.Data) != nil {
				msg.Respond(nil)
				nc.Flush()
				m.pending.Add(int64(-1))
				continue
			}
			batch = append(batch, ev)
			acks = append(acks, msg)
		}

		select {
		case <-ctx.Done():
			goto drain
		default:
		}
	}

drain:
	if len(batch) > 0 {
		flushToClickHouse(conn, cfg, batch, m)
		ackMessages(acks, nc, m)
	}
	log.Printf("[w%d] stopped", id)
}

func flushToClickHouse(conn clickhouse.Conn, cfg Config, batch []AnalyticsEvent, m *metrics) {
	if len(batch) == 0 {
		return
	}
	if err := insertBatch(conn, cfg.ClickHouseDB, batch); err != nil {
		log.Printf("[flush] clickhouse error: %v", err)
		return
	}
	m.flushed.Add(int64(len(batch)))
}

func ackMessages(acks []*nats.Msg, nc *nats.Conn, m *metrics) {
	if len(acks) == 0 {
		return
	}
	for _, msg := range acks {
		if err := msg.Respond(nil); err != nil {
			log.Printf("[ack] error: %v", err)
		}
	}
	if err := nc.Flush(); err != nil {
		log.Printf("[ack] flush error: %v", err)
	}
	m.pending.Add(int64(-len(acks)))
}

func extractSeq(reply string) uint64 {
	if len(reply) < 10 {
		return 0
	}
	dotCount := 0
	for i := 0; i < len(reply); i++ {
		if reply[i] == '.' {
			dotCount++
			if dotCount == 5 {
				start := i + 1
				var v uint64
				for j := start; j < len(reply); j++ {
					if reply[j] == '.' {
						return v
					}
					if reply[j] < '0' || reply[j] > '9' {
						return 0
					}
					v = v*10 + uint64(reply[j]-'0')
				}
				return v
			}
		}
	}
	return 0
}

func insertBatch(conn clickhouse.Conn, db string, events []AnalyticsEvent) error {
	batch, err := conn.PrepareBatch(context.Background(),
		"INSERT INTO analytics.ad_events")
	if err != nil {
		return err
	}
	now := time.Now()
	for i := range events {
		ev := &events[i]
		if err := batch.Append(
			ev.Event, ev.Publisher, ev.Slot, ev.Ts, now,
			ev.Tag, ev.ErrMsg, ev.Quartile, ev.Duration, ev.MediaCount,
			ev.TagUrl, ev.Progress, "", "", "", "",
		); err != nil {
			return err
		}
	}
	return batch.Send()
}
