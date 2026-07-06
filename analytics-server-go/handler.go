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

func handleCollect(ctx *fasthttp.RequestCtx, raw chan<- string, received, dropped *atomic.Int64) {
	q := string(ctx.URI().QueryString())
	if q == "" {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	select {
	case raw <- q:
		received.Add(1)
	default:
		dropped.Add(1)
	}

	ctx.Response.Header.SetContentType("image/gif")
	ctx.Response.Header.Set("Cache-Control", "no-store, no-cache, must-revalidate")
	ctx.Response.Header.Set("Access-Control-Allow-Origin", "*")
	ctx.Write(pixelGIF)
}

func handleHealth(ctx *fasthttp.RequestCtx, cfg Config, received, flushed, dropped *atomic.Int64, raw chan string) {
	if !authorized(ctx, cfg.AdminToken) {
		ctx.SetStatusCode(fasthttp.StatusUnauthorized)
		ctx.SetBody([]byte(`{"error":"Unauthorized"}`))
		return
	}
	rate := float64(flushed.Load()) / timeSinceStart().Seconds()
	ctx.SetContentType("application/json")
	fmt.Fprintf(ctx,
		`{"ok":true,"uptime":%.1f,"received":%d,"flushed":%d,"buffer":%d,"dropped":%d,"rate":%.0f}`,
		timeSinceStart().Seconds(), received.Load(), flushed.Load(),
		len(raw), dropped.Load(), rate)
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

func timeSinceStart() time.Duration { return time.Since(startTime) }
