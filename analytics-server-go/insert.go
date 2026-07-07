package main

import (
	"context"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/nats-io/nats.go"
)

func startWorkers(ctx context.Context, cfg Config, js nats.JetStreamContext, m *metrics) {
	for i := 0; i < cfg.FlushWorkers; i++ {
		go func(id int) {
			runWorker(ctx, id, cfg, js, m)
		}(i)
	}
	log.Printf("[workers] started %d workers", cfg.FlushWorkers)
}

func runWorker(ctx context.Context, id int, cfg Config, js nats.JetStreamContext, m *metrics) {
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

	batch := make([]AnalyticsEvent, 0, cfg.BatchSize)
	pending := make([]*nats.Msg, 0, cfg.BatchSize)

	for {
		if len(batch) >= cfg.BatchSize {
			flushAndAck(conn, cfg, batch, pending, m)
			batch = batch[:0]
			pending = pending[:0]
		}

		need := cfg.BatchSize - len(batch)
		msgs, err := sub.Fetch(need, nats.MaxWait(time.Duration(cfg.BatchIntervalMs)*time.Millisecond))
		if err == nats.ErrTimeout {
			if len(batch) > 0 {
				flushAndAck(conn, cfg, batch, pending, m)
				batch = batch[:0]
				pending = pending[:0]
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
			var ev AnalyticsEvent
			if ev.UnmarshalBinary(msg.Data) != nil {
				msg.Ack()
				continue
			}
			batch = append(batch, ev)
			pending = append(pending, msg)
		}

		select {
		case <-ctx.Done():
			goto drain
		default:
		}
	}

drain:
	flushAndAck(conn, cfg, batch, pending, m)
	log.Printf("[w%d] stopped", id)
}

func flushAndAck(conn clickhouse.Conn, cfg Config, batch []AnalyticsEvent, pending []*nats.Msg, m *metrics) {
	if len(batch) == 0 {
		return
	}
	if err := insertBatch(conn, cfg.ClickHouseDB, batch); err != nil {
		log.Printf("[flush] error: %v (nak %d)", err, len(pending))
		for _, msg := range pending {
			msg.Nak()
		}
		return
	}
	for _, msg := range pending {
		msg.Ack()
	}
	m.flushed.Add(int64(len(batch)))
	m.pending.Add(int64(-len(pending)))
}

func insertBatch(conn clickhouse.Conn, db string, events []AnalyticsEvent) error {
	batch, err := conn.PrepareBatch(context.Background(),
		"INSERT INTO analytics.ad_events")
	if err != nil {
		return err
	}
	for i := range events {
		ev := &events[i]
		if err := batch.Append(
			ev.Event, ev.Publisher, ev.Slot, ev.Ts, ev.Timestamp,
			ev.Tag, ev.ErrMsg, ev.Quartile, ev.Duration, ev.MediaCount,
			ev.TagUrl, ev.Progress, "", "", "", "",
		); err != nil {
			return err
		}
	}
	return batch.Send()
}
