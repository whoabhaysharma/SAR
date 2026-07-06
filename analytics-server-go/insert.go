package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func startWorkers(cfg Config, raw <-chan string, flushed *atomic.Int64) {
	var wg sync.WaitGroup
	for i := 0; i < cfg.FlushWorkers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			runWorker(id, cfg, raw, flushed)
		}(i)
	}
}

func runWorker(id int, cfg Config, raw <-chan string, flushed *atomic.Int64) {
	conn, err := newCHConn(cfg)
	if err != nil {
		log.Printf("[w%d] connect: %v", id, err)
		return
	}
	defer conn.Close()
	log.Printf("[w%d] ready", id)

	events := make([]string, 0, cfg.BatchSize)
	scratch := make([]AnalyticsEvent, 0, cfg.BatchSize)
	ticker := time.NewTicker(time.Duration(cfg.BatchIntervalMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case s := <-raw:
			events = append(events, s)
			for len(raw) > 0 && len(events) < cfg.BatchSize {
				select {
				case s := <-raw:
					events = append(events, s)
				default:
					goto flush
				}
			}
		case <-ticker.C:
		}
	flush:
		if len(events) == 0 {
			continue
		}
		scratch = scratch[:0]
		for _, q := range events {
			scratch = append(scratch, parseQuery(q))
		}
		if err := insertBatch(conn, cfg.ClickHouseDB, scratch); err != nil {
			log.Printf("[w%d] flush: %v", id, err)
		} else {
			flushed.Add(int64(len(events)))
		}
		events = events[:0]
	}
}

func insertBatch(conn clickhouse.Conn, db string, events []AnalyticsEvent) error {
	batch, err := conn.PrepareBatch(context.Background(),
		fmt.Sprintf("INSERT INTO %s.ad_events", db))
	if err != nil {
		return err
	}
	for i := range events {
		ev := &events[i]
		if err := batch.Append(
			ev.Event, ev.Publisher, ev.Slot, ev.Ts, ev.Timestamp,
			ev.Tag, ev.ErrMsg, ev.Quartile, ev.Duration, ev.MediaCount,
			ev.TagUrl, ev.Progress, "", "", "", ev.JSON,
		); err != nil {
			return err
		}
	}
	return batch.Send()
}
