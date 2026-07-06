package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/valyala/fasthttp"
)

var startTime = time.Now()

type Config struct {
	Port             int
	ClickHouseHTTP   string
	ClickHouseNative string
	ClickHouseUser   string
	ClickHousePass   string
	ClickHouseDB     string
	BatchSize        int
	BatchIntervalMs  int
	FlushWorkers     int
	AdminToken       string
}

func loadConfig() Config {
	port, _ := strconv.Atoi(getEnv("PORT", "8080"))
	batchSize, _ := strconv.Atoi(getEnv("BATCH_MAX_SIZE", "5000"))
	batchInterval, _ := strconv.Atoi(getEnv("BATCH_INTERVAL_MS", "1000"))
	flushWorkers, _ := strconv.Atoi(getEnv("FLUSH_WORKERS", "12"))
	return Config{
		Port:             port,
		ClickHouseHTTP:   getEnv("CLICKHOUSE_HOST", "http://localhost:8123"),
		ClickHouseNative: getEnv("CLICKHOUSE_NATIVE_HOST", "localhost:9000"),
		ClickHouseUser:   getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePass:   getEnv("CLICKHOUSE_PASSWORD", ""),
		ClickHouseDB:     getEnv("CLICKHOUSE_DB", "analytics"),
		BatchSize:        batchSize,
		BatchIntervalMs:  batchInterval,
		FlushWorkers:     flushWorkers,
		AdminToken:       getEnv("ADMIN_TOKEN", ""),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func newCHConn(cfg Config) (clickhouse.Conn, error) {
	return clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseNative},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePass,
		},
		MaxOpenConns:    2,
		MaxIdleConns:    2,
		ConnMaxLifetime: time.Hour,
		DialTimeout:     5 * time.Second,
		Compression:     &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
		Settings: clickhouse.Settings{
			"async_insert":               1,
			"wait_for_async_insert":      0,
			"async_insert_max_data_size": 10_485_760,
		},
	})
}

func main() {
	cfg := loadConfig()

	ch := &chClient{host: cfg.ClickHouseHTTP, user: cfg.ClickHouseUser, pass: cfg.ClickHousePass}
	if err := ch.init(cfg.ClickHouseDB); err != nil {
		log.Fatalf("[ch] init failed: %v", err)
	}
	log.Println("[ch] ready")

	raw := make(chan string, 1_000_000)

	var received, flushed, dropped atomic.Int64

	startWorkers(cfg, raw, &flushed)

	go logStats(raw, &received, &flushed, &dropped)

	var fsHandler fasthttp.RequestHandler
	if fi, err := os.Stat("public"); err == nil && fi.IsDir() {
		fs := &fasthttp.FS{Root: "public", IndexNames: []string{"index.html"}}
		fsHandler = fs.NewRequestHandler()
	}

	handler := func(ctx *fasthttp.RequestCtx) {
		switch string(ctx.Path()) {
		case "/collect":
			handleCollect(ctx, raw, &received, &dropped)
		case "/health":
			handleHealth(ctx, cfg, &received, &flushed, &dropped, raw)
		case "/recent":
			handleRecent(ctx, cfg, ch)
		case "/events":
			handleRecent(ctx, cfg, ch)
		default:
			if fsHandler != nil {
				fsHandler(ctx)
			} else {
				ctx.NotFound()
			}
		}
	}

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("[http] %s workers=%d batch=%d", addr, cfg.FlushWorkers, cfg.BatchSize)

	srv := &fasthttp.Server{Handler: handler, Name: "analytics"}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig
		log.Println("shutting down...")
		srv.Shutdown()
	}()

	if err := srv.ListenAndServe(addr); err != nil {
		log.Fatalf("[http] %v", err)
	}
}

func logStats(raw chan string, received, flushed, dropped *atomic.Int64) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		r := received.Load()
		f := flushed.Load()
		rate := float64(f) / time.Since(startTime).Seconds()
		log.Printf("[stats] rcv=%d flushed=%d dropped=%d queue=%d rate=%.0f/s",
			r, f, dropped.Load(), len(raw), rate)
	}
}
