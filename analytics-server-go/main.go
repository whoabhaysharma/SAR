package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

var (
	PIXEL_GIF = []byte{0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b}

	knownFields = map[string]bool{
		"event": true, "publisher": true, "slot": true, "ts": true,
		"tag": true, "error": true, "quartile": true, "duration": true,
		"mediaCount": true, "tagUrl": true, "progress": true,
	}
)

// ── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	ServiceMode      string
	Port             int
	NATSUrl          string
	ClickHouseHTTP   string
	ClickHouseNative string
	ClickHouseUser   string
	ClickHousePass   string
	ClickHouseDB     string
	BatchMaxSize     int
	BatchIntervalMs  int
	AdminToken       string
	MaxRetries       int
}

func loadConfig() Config {
	port, _ := strconv.Atoi(getEnv("PORT", "8080"))
	batchSize, _ := strconv.Atoi(getEnv("BATCH_MAX_SIZE", "1000"))
	batchInterval, _ := strconv.Atoi(getEnv("BATCH_INTERVAL_MS", "5000"))
	maxRetries, _ := strconv.Atoi(getEnv("MAX_RETRIES", "5"))
	return Config{
		ServiceMode:      getEnv("SERVICE_MODE", "server"),
		Port:            port,
		NATSUrl:          getEnv("NATS_URL", "nats://localhost:4222"),
		ClickHouseHTTP:   getEnv("CLICKHOUSE_HOST", "http://localhost:8123"),
		ClickHouseNative: getEnv("CLICKHOUSE_NATIVE_HOST", "localhost:9000"),
		ClickHouseUser:   getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePass:   getEnv("CLICKHOUSE_PASSWORD", ""),
		ClickHouseDB:     getEnv("CLICKHOUSE_DB", "analytics"),
		BatchMaxSize:    batchSize,
		BatchIntervalMs: batchInterval,
		AdminToken:      getEnv("ADMIN_TOKEN", ""),
		MaxRetries:      maxRetries,
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ── Event ───────────────────────────────────────────────────────────────────

type AnalyticsEvent struct {
	Event      string `json:"event"`
	Publisher  string `json:"publisher"`
	Slot       string `json:"slot"`
	Ts         uint64 `json:"ts"`
	Time       string `json:"time"`
	Tag        string `json:"tag"`
	Error      string `json:"error"`
	Quartile   uint8  `json:"quartile"`
	Duration   uint32 `json:"duration"`
	MediaCount uint8  `json:"mediaCount"`
	TagUrl     string `json:"tagUrl"`
	Progress   string `json:"progress"`
	IP         string `json:"ip"`
	UserAgent  string `json:"userAgent"`
	Referer    string `json:"referer"`
	JSON       string `json:"json"`
}

// ── ClickHouse HTTP (for queries) ──────────────────────────────────────────

type ClickhouseQuery struct {
	host   string
	user   string
	pass   string
	client *http.Client
}

func NewClickhouseQuery(cfg Config) *ClickhouseQuery {
	return &ClickhouseQuery{
		host:   cfg.ClickHouseHTTP,
		user:   cfg.ClickHouseUser,
		pass:   cfg.ClickHousePass,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (q *ClickhouseQuery) Exec(query string) error {
	req, err := http.NewRequest("POST", q.host, strings.NewReader(query))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "text/plain")
	if q.user != "" {
		req.SetBasicAuth(q.user, q.pass)
	}
	resp, err := q.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("clickhouse error: status %d", resp.StatusCode)
	}
	return nil
}

func (q *ClickhouseQuery) Query(query string) ([]map[string]interface{}, error) {
	req, err := http.NewRequest("POST", q.host, strings.NewReader(query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "text/plain")
	if q.user != "" {
		req.SetBasicAuth(q.user, q.pass)
	}
	resp, err := q.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("query failed: status %d", resp.StatusCode)
	}
	var result []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func (q *ClickhouseQuery) Init(db string) error {
	if err := q.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", db)); err != nil {
		return fmt.Errorf("create database: %w", err)
	}
	createTable := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %s.ad_events (
  event       LowCardinality(String),
  publisher   LowCardinality(String),
  slot        LowCardinality(String),
  ts          UInt64,
  time        DateTime,
  tag         LowCardinality(String) DEFAULT '',
  error       LowCardinality(String) DEFAULT '',
  quartile    UInt8 DEFAULT 0,
  duration    UInt32 DEFAULT 0,
  mediaCount  UInt8 DEFAULT 0,
  tagUrl      String DEFAULT '',
  progress    String DEFAULT '',
  ip          String DEFAULT '',
  userAgent   String DEFAULT '',
  referer     String DEFAULT '',
  json        String DEFAULT ''
) ENGINE = MergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (publisher, event, time)
TTL time + INTERVAL 90 DAY DELETE`, db)
	if err := q.Exec(createTable); err != nil {
		return fmt.Errorf("create table: %w", err)
	}
	return nil
}

// ── NATS helpers ────────────────────────────────────────────────────────────

func ensureStream(js jetstream.JetStream) error {
	_, err := js.CreateOrUpdateStream(context.Background(), jetstream.StreamConfig{
		Name:      "analytics",
		Subjects:  []string{"events.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
		MaxAge:    24 * time.Hour,
		Replicas:  1,
	})
	return err
}

// ── Producer (HTTP server mode) ─────────────────────────────────────────────

func runServer(cfg Config) {
	qh := NewClickhouseQuery(cfg)
	if err := qh.Init(cfg.ClickHouseDB); err != nil {
		log.Fatalf("[server] clickhouse init failed: %v", err)
	}
	log.Println("[server] clickhouse connected")

	nc, err := nats.Connect(cfg.NATSUrl, nats.MaxReconnects(-1), nats.ReconnectWait(2*time.Second))
	if err != nil {
		log.Fatalf("[server] nats connect failed: %v", err)
	}
	defer nc.Close()
	log.Println("[server] nats connected")

	js, err := jetstream.New(nc)
	if err != nil {
		log.Fatalf("[server] jetstream init failed: %v", err)
	}

	if err := ensureStream(js); err != nil {
		log.Fatalf("[server] stream create failed: %v", err)
	}
	log.Println("[server] jetstream stream ready")

	var published atomic.Int64

	mux := http.NewServeMux()

	mux.HandleFunc("/collect", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		hasJSON := false
		jsonPayload := make(map[string]string)
		for k, v := range q {
			if !knownFields[k] {
				jsonPayload[k] = v[0]
				hasJSON = true
			}
		}
		jsonStr := ""
		if hasJSON {
			b, _ := json.Marshal(jsonPayload)
			jsonStr = string(b)
		}

		ts, _ := strconv.ParseUint(q.Get("ts"), 10, 64)
		if ts == 0 {
			ts = uint64(time.Now().UnixMilli())
		}
		quartile, _ := strconv.ParseUint(q.Get("quartile"), 10, 8)
		duration, _ := strconv.ParseUint(q.Get("duration"), 10, 32)
		mediaCount, _ := strconv.ParseUint(q.Get("mediaCount"), 10, 8)

		ip := r.RemoteAddr
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			ip = strings.Split(fwd, ",")[0]
		} else if fwd := r.Header.Get("X-Real-IP"); fwd != "" {
			ip = fwd
		} else if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}

		event := AnalyticsEvent{
			Event:      q.Get("event"),
			Publisher:  q.Get("publisher"),
			Slot:       q.Get("slot"),
			Ts:         ts,
			Time:       time.Now().UTC().Format("2006-01-02 15:04:05"),
			Tag:        q.Get("tag"),
			Error:      q.Get("error"),
			Quartile:   uint8(quartile),
			Duration:   uint32(duration),
			MediaCount: uint8(mediaCount),
			TagUrl:     q.Get("tagUrl"),
			Progress:   q.Get("progress"),
			IP:         ip,
			UserAgent:  r.UserAgent(),
			Referer:    r.Referer(),
			JSON:       jsonStr,
		}
		if event.Event == "" {
			event.Event = "unknown"
		}

		data, _ := json.Marshal(event)
		msgId := fmt.Sprintf("%s-%d-%d", event.Publisher, event.Ts, time.Now().UnixNano())
		_, pubErr := js.Publish(context.Background(), "events.track", data, jetstream.WithMsgID(msgId))
		if pubErr != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		published.Add(1)

		w.Header().Set("Content-Type", "image/gif")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Expires", "0")
		w.Header().Set("Pragma", "no-cache")
		w.Write(PIXEL_GIF)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if cfg.AdminToken != "" {
			token := r.URL.Query().Get("token")
			if token == "" {
				token = r.Header.Get("X-Api-Key")
			}
			if token != cfg.AdminToken {
				http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}
		}
		var depth int64
		if stream, err := js.Stream(context.Background(), "analytics"); err == nil {
			if info, err := stream.Info(context.Background()); err == nil {
				depth = int64(info.State.Msgs)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"uptime":%.1f,"published":%d,"queue_depth":%d}`,
			time.Since(startTime).Seconds(), published.Load(), depth)
	})

	mux.HandleFunc("/recent", func(w http.ResponseWriter, r *http.Request) {
		if cfg.AdminToken != "" {
			token := r.URL.Query().Get("token")
			if token == "" {
				token = r.Header.Get("X-Api-Key")
			}
			if token != cfg.AdminToken {
				http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		query := fmt.Sprintf(`SELECT event, publisher, slot, time FROM %s.ad_events ORDER BY time DESC LIMIT 50 FORMAT JSONEachRow`, cfg.ClickHouseDB)
		result, err := qh.Query(query)
		if err != nil {
			w.Write([]byte("[]"))
			return
		}
		json.NewEncoder(w).Encode(result)
	})

	if _, err := os.Stat("public"); err == nil {
		fs := http.FileServer(http.Dir("public"))
		mux.Handle("/", fs)
	}

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("[server] listening on %s", addr)
	log.Printf("[server] collecting at /collect")
	log.Printf("[server] health at /health")

	server := &http.Server{Addr: addr, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 120 * time.Second}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
		<-sigCh
		log.Println("[server] shutting down...")
		server.Shutdown(context.Background())
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[server] fatal: %v", err)
	}
}

// ── Consumer (ClickHouse writer mode) ───────────────────────────────────────

func runWriter(cfg Config) {
	nc, err := nats.Connect(cfg.NATSUrl, nats.MaxReconnects(-1), nats.ReconnectWait(2*time.Second))
	if err != nil {
		log.Fatalf("[writer] nats connect failed: %v", err)
	}
	defer nc.Close()
	log.Println("[writer] nats connected")

	js, err := jetstream.New(nc)
	if err != nil {
		log.Fatalf("[writer] jetstream init failed: %v", err)
	}

	if err := ensureStream(js); err != nil {
		log.Fatalf("[writer] stream create failed: %v", err)
	}

	// Connect to ClickHouse native
	ch, err := sql.Open("clickhouse", fmt.Sprintf("clickhouse://%s:%s@%s/%s?dial_timeout=5s&max_execution_time=30s",
		cfg.ClickHouseUser, cfg.ClickHousePass, cfg.ClickHouseNative, cfg.ClickHouseDB))
	if err != nil {
		log.Fatalf("[writer] clickhouse native connect failed: %v", err)
	}
	defer ch.Close()

	if err := ch.Ping(); err != nil {
		log.Fatalf("[writer] clickhouse ping failed: %v", err)
	}
	log.Println("[writer] clickhouse native connected")

	cons, err := js.CreateOrUpdateConsumer(context.Background(), "analytics", jetstream.ConsumerConfig{
		Durable:       "clickhouse-writer",
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    cfg.MaxRetries,
		FilterSubject: "events.track",
	})
	if err != nil {
		log.Fatalf("[writer] consumer create failed: %v", err)
	}
	log.Println("[writer] jetstream consumer ready")

	var (
		totalWritten atomic.Int64
		totalDead    atomic.Int64
	)

	batch := make([]AnalyticsEvent, 0, cfg.BatchMaxSize)
	var batchMu sync.Mutex

	flushBatch := func() {
		batchMu.Lock()
		if len(batch) == 0 {
			batchMu.Unlock()
			return
		}
		toInsert := make([]AnalyticsEvent, len(batch))
		copy(toInsert, batch)
		batch = batch[:0]
		batchMu.Unlock()

		tx, err := ch.Begin()
		if err != nil {
			log.Printf("[writer] begin tx failed: %v", err)
			return
		}

		stmt, err := tx.Prepare(`INSERT INTO ad_events (event, publisher, slot, ts, time, tag, error, quartile, duration, mediaCount, tagUrl, progress, ip, userAgent, referer, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			log.Printf("[writer] prepare failed: %v", err)
			tx.Rollback()
			return
		}

		for _, e := range toInsert {
			if _, err := stmt.Exec(e.Event, e.Publisher, e.Slot, e.Ts, e.Time, e.Tag, e.Error, e.Quartile, e.Duration, e.MediaCount, e.TagUrl, e.Progress, e.IP, e.UserAgent, e.Referer, e.JSON); err != nil {
				log.Printf("[writer] exec failed: %v", err)
				tx.Rollback()
				return
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("[writer] commit failed: %v", err)
			return
		}

		totalWritten.Add(int64(len(toInsert)))
		if totalWritten.Load()%10000 == 0 {
			log.Printf("[writer] written %d events total", totalWritten.Load())
		}
	}

	// Pull loop
	go func() {
		for {
			fetchCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			msgs, err := cons.Fetch(cfg.BatchMaxSize, jetstream.FetchMaxWait(1*time.Second))
			cancel()
			_ = fetchCtx
			if err != nil {
				if err == nats.ErrTimeout {
					continue
				}
				log.Printf("[writer] fetch error: %v", err)
				time.Sleep(100 * time.Millisecond)
				continue
			}

			for msg := range msgs.Messages() {
				var event AnalyticsEvent
				if err := json.Unmarshal(msg.Data(), &event); err != nil {
					msg.Ack()
					continue
				}

				batchMu.Lock()
				batch = append(batch, event)
				shouldFlush := len(batch) >= cfg.BatchMaxSize
				batchMu.Unlock()

				if shouldFlush {
					flushBatch()
				}
				msg.Ack()
			}
		}
	}()

	log.Printf("[writer] batch size: %d / interval: %dms / max retries: %d", cfg.BatchMaxSize, cfg.BatchIntervalMs, cfg.MaxRetries)

	ticker := time.NewTicker(time.Duration(cfg.BatchIntervalMs) * time.Millisecond)
	defer ticker.Stop()
	go func() {
		for range ticker.C {
			flushBatch()
		}
	}()

	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			log.Printf("[writer] written=%d dead=%d batch=%d", totalWritten.Load(), totalDead.Load(), len(batch))
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	<-sigCh
	log.Println("[writer] shutting down...")
	flushBatch()
}

// ── Main ────────────────────────────────────────────────────────────────────

var startTime = time.Now()

func main() {
	cfg := loadConfig()

	switch cfg.ServiceMode {
	case "writer":
		runWriter(cfg)
	default:
		runServer(cfg)
	}
}
