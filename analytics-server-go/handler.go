package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/valyala/fasthttp"
)

var pixelGIF = []byte{
	0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
	0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
	0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
	0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
	0x01, 0x00, 0x3b,
}

type eventPublisher func(AnalyticsEvent) bool

func handleCollect(ctx *fasthttp.RequestCtx, publish eventPublisher, received, dropped *atomic.Int64) {
	q := ctx.URI().QueryString()
	if len(q) == 0 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	ev := parseQueryBytes(q)

	if publish(ev) {
		received.Add(1)
	} else {
		dropped.Add(1)
	}

	ctx.SetStatusCode(fasthttp.StatusOK)
	ctx.Response.Header.SetContentType("image/gif")
	ctx.Response.Header.SetBytesKV([]byte("Cache-Control"), []byte("no-store, no-cache, must-revalidate"))
	ctx.Response.Header.SetBytesKV([]byte("Access-Control-Allow-Origin"), []byte("*"))
	ctx.Write(pixelGIF)
}

type metrics struct {
	received, flushed, dropped, pending *atomic.Int64
	startTime                           time.Time
}

func handleHealth(ctx *fasthttp.RequestCtx, cfg Config, m *metrics) {
	if !authorized(ctx, cfg.AdminToken) {
		ctx.SetStatusCode(fasthttp.StatusUnauthorized)
		ctx.SetBody([]byte(`{"error":"Unauthorized"}`))
		return
	}
	rate := float64(m.flushed.Load()) / time.Since(m.startTime).Seconds()
	ctx.SetContentType("application/json")
	fmt.Fprintf(ctx,
		`{"ok":true,"uptime":%.1f,"received":%d,"flushed":%d,"pending":%d,"dropped":%d,"rate":%.0f}`,
		time.Since(m.startTime).Seconds(), m.received.Load(), m.flushed.Load(),
		m.pending.Load(), m.dropped.Load(), rate)
}

func handleRecent(ctx *fasthttp.RequestCtx, cfg Config, ch *chClient) {
	if !authorized(ctx, cfg.AdminToken) {
		ctx.SetStatusCode(fasthttp.StatusUnauthorized)
		ctx.SetBody([]byte(`{"error":"Unauthorized"}`))
		return
	}
	limit := 50
	if l := ctx.QueryArgs().Peek("limit"); len(l) > 0 {
		if v, err := strconv.Atoi(string(l)); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	ctx.SetContentType("application/json")
	result, err := ch.query(fmt.Sprintf(
		`SELECT event, publisher, slot, time, ts, quartile, duration, tag, error, progress, tagUrl, json FROM %s.ad_events ORDER BY time DESC LIMIT %d FORMAT JSON`,
		cfg.ClickHouseDB, limit))
	if err != nil {
		ctx.SetBody([]byte("[]"))
		return
	}
	json.NewEncoder(ctx).Encode(result)
}

func authorized(ctx *fasthttp.RequestCtx, token string) bool {
	if token == "" {
		return true
	}
	if string(ctx.QueryArgs().Peek("token")) == token {
		return true
	}
	if string(ctx.Request.Header.Peek("X-Api-Key")) == token {
		return true
	}
	return false
}


