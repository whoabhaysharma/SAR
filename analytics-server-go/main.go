package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/nats-io/nats.go"
	"github.com/valyala/fasthttp"
)

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
	NatsURL          string
	NatsSubject      string
}

func loadConfig() Config {
	port, _ := strconv.Atoi(getEnv("PORT", "8080"))
	batchSize, _ := strconv.Atoi(getEnv("BATCH_MAX_SIZE", "5000"))
	batchInterval, _ := strconv.Atoi(getEnv("BATCH_INTERVAL_MS", "250"))
	flushWorkers, _ := strconv.Atoi(getEnv("FLUSH_WORKERS", "4"))
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
		NatsURL:          getEnv("NATS_URL", "nats://nats:4222"),
		NatsSubject:      getEnv("NATS_SUBJECT", "analytics.events"),
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

func connectNATS(url string) (*nats.Conn, error) {
	if url == "" {
		return nil, nil
	}
	var nc *nats.Conn
	var err error
	for i := 0; i < 30; i++ {
		nc, err = nats.Connect(url,
			nats.Name("analytics-server"),
			nats.ReconnectBufSize(256*1024*1024),
			nats.RetryOnFailedConnect(true),
			nats.MaxReconnects(-1),
			nats.ReconnectWait(500*time.Millisecond),
		)
		if err == nil {
			break
		}
		log.Printf("[nats] connect attempt %d: %v", i+1, err)
		time.Sleep(1 * time.Second)
	}
	return nc, err
}

func main() {
	cfg := loadConfig()

	ch := &chClient{host: cfg.ClickHouseHTTP, user: cfg.ClickHouseUser, pass: cfg.ClickHousePass}
	if err := ch.init(cfg.ClickHouseDB); err != nil {
		log.Fatalf("[ch] init failed: %v", err)
	}
	log.Println("[ch] ready")

	nc, err := connectNATS(cfg.NatsURL)
	if err != nil {
		log.Fatalf("[nats] %v", err)
	}
	defer nc.Close()

	js, err := setupJetStream(nc)
	if err != nil {
		log.Fatalf("[jetstream] %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	m := &metrics{startTime: time.Now()}
	m.received = new(atomic.Int64)
	m.flushed = new(atomic.Int64)
	m.dropped = new(atomic.Int64)
	m.pending = new(atomic.Int64)

	publish := publishToJetStream(js)
	startWorkers(ctx, cfg, js, m)
	go logStats(m)

	var collectPath = []byte("/collect")
	var healthPath = []byte("/health")
	var recentPath = []byte("/recent")
	var eventsPath = []byte("/events")

	var fsHandler fasthttp.RequestHandler
	if fi, err := os.Stat("public"); err == nil && fi.IsDir() {
		fs := &fasthttp.FS{Root: "public", IndexNames: []string{"index.html"}}
		fsHandler = fs.NewRequestHandler()
	}

	handler := func(ctx *fasthttp.RequestCtx) {
		path := ctx.Path()
		switch {
		case bytesEqual(path, collectPath):
			handleCollect(ctx, publish, m.received, m.dropped)
		case bytesEqual(path, healthPath):
			handleHealth(ctx, cfg, m)
		case bytesEqual(path, recentPath):
			handleRecent(ctx, cfg, ch)
		case bytesEqual(path, eventsPath):
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
	log.Printf("[http] %s workers=%d batch=%d interval=%dms", addr, cfg.FlushWorkers, cfg.BatchSize, cfg.BatchIntervalMs)

	srv := &fasthttp.Server{
		Handler:            handler,
		Name:               "analytics",
		Concurrency:        65536,
		ReadBufferSize:     16384,
		WriteBufferSize:    16384,
		MaxConnsPerIP:      0,
		MaxRequestsPerConn: 0,
		TCPKeepalive:       true,
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig
		log.Println("shutting down...")

		srv.Shutdown()
		cancel()
		nc.Close()
	}()

	if err := srv.ListenAndServe(addr); err != nil {
		log.Fatalf("[http] %v", err)
	}
}

func logStats(m *metrics) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		r := m.received.Load()
		f := m.flushed.Load()
		rate := float64(f) / time.Since(m.startTime).Seconds()
		log.Printf("[stats] rcv=%d flushed=%d pending=%d dropped=%d rate=%.0f/s",
			r, f, m.pending.Load(), m.dropped.Load(), rate)
	}
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
