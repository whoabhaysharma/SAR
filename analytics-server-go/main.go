package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

var (
	PIXEL_GIF = []byte{0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b}

	knownFields = map[string]bool{
		"event": true, "publisher": true, "slot": true, "ts": true,
		"tag": true, "error": true, "quartile": true, "duration": true,
		"mediaCount": true, "tagUrl": true, "progress": true,
	}
)

type Config struct {
	Port             int
	ClickHouseHost   string
	ClickHouseUser   string
	ClickHousePass   string
	ClickHouseDB     string
	BatchMaxSize     int
	BatchIntervalMs  int
	AdminToken       string
}

func loadConfig() Config {
	port, _ := strconv.Atoi(getEnv("PORT", "8080"))
	batchSize, _ := strconv.Atoi(getEnv("BATCH_MAX_SIZE", "1000"))
	batchInterval, _ := strconv.Atoi(getEnv("BATCH_INTERVAL_MS", "5000"))
	return Config{
		Port:            port,
		ClickHouseHost:  getEnv("CLICKHOUSE_HOST", "http://localhost:8123"),
		ClickHouseUser:  getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePass:  getEnv("CLICKHOUSE_PASSWORD", ""),
		ClickHouseDB:    getEnv("CLICKHOUSE_DB", "analytics"),
		BatchMaxSize:    batchSize,
		BatchIntervalMs: batchInterval,
		AdminToken:      getEnv("ADMIN_TOKEN", ""),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

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

type Batcher struct {
	ch          chan AnalyticsEvent
	flushSize   int
	flushTicker *time.Ticker
	db          *ClickhouseDB
	dropped     atomic.Int64
	stats       struct {
		activeFlushes atomic.Int32
		queueSize     atomic.Int64
	}
}

type ClickhouseDB struct {
	host   string
	user   string
	pass   string
	db     string
	client *http.Client
}

func NewClickhouseDB(cfg Config) *ClickhouseDB {
	return &ClickhouseDB{
		host:   cfg.ClickHouseHost,
		user:   cfg.ClickHouseUser,
		pass:   cfg.ClickHousePass,
		db:     cfg.ClickHouseDB,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (db *ClickhouseDB) Exec(query string) error {
	url := db.host
	req, err := http.NewRequest("POST", url, strings.NewReader(query))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "text/plain")
	if db.user != "" {
		req.SetBasicAuth(db.user, db.pass)
	}
	resp, err := db.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("clickhouse error: status %d", resp.StatusCode)
	}
	return nil
}

func (db *ClickhouseDB) Init() error {
	createDB := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", db.db)
	if err := db.Exec(createDB); err != nil {
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
TTL time + INTERVAL 90 DAY DELETE`, db.db)
	if err := db.Exec(createTable); err != nil {
		return fmt.Errorf("create table: %w", err)
	}
	return nil
}

func (db *ClickhouseDB) Insert(events []AnalyticsEvent) error {
	if len(events) == 0 {
		return nil
	}

	var sb strings.Builder
	for _, e := range events {
		sb.WriteString(fmt.Sprintf("%s\t%s\t%s\t%d\t%s\t%s\t%s\t%d\t%d\t%d\t%s\t%s\t%s\t%s\t%s\t%s\n",
			escapeTab(e.Event), escapeTab(e.Publisher), escapeTab(e.Slot),
			e.Ts, escapeTab(e.Time), escapeTab(e.Tag), escapeTab(e.Error),
			e.Quartile, e.Duration, e.MediaCount,
			escapeTab(e.TagUrl), escapeTab(e.Progress),
			escapeTab(e.IP), escapeTab(e.UserAgent), escapeTab(e.Referer),
			escapeTab(e.JSON),
		))
	}

	query := fmt.Sprintf("INSERT INTO %s.ad_events FORMAT TabSeparated", db.db)
	url := fmt.Sprintf("%s?query=%s", db.host, strings.ReplaceAll(query, " ", "%20"))

	req, err := http.NewRequest("POST", url, strings.NewReader(sb.String()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "text/plain")
	if db.user != "" {
		req.SetBasicAuth(db.user, db.pass)
	}

	resp, err := db.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("insert failed: status %d", resp.StatusCode)
	}
	return nil
}

func escapeTab(s string) string {
	s = strings.ReplaceAll(s, "\t", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

func (db *ClickhouseDB) Query(query string) ([]map[string]interface{}, error) {
	url := db.host
	req, err := http.NewRequest("POST", url, strings.NewReader(query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "text/plain")
	if db.user != "" {
		req.SetBasicAuth(db.user, db.pass)
	}

	resp, err := db.client.Do(req)
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

func NewBatcher(db *ClickhouseDB, flushSize, flushIntervalMs int) *Batcher {
	b := &Batcher{
		ch:        make(chan AnalyticsEvent, 500_000),
		flushSize: flushSize,
		db:        db,
	}
	b.stats.queueSize.Store(0)
	return b
}

func (b *Batcher) Start() {
	// Concurrent flush workers
	for i := 0; i < 4; i++ {
		go b.flushWorker()
	}

	// Timer-based flush
	go func() {
		ticker := time.NewTicker(time.Duration(5) * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			b.flush()
		}
	}()
}

func (b *Batcher) flushWorker() {
	for {
		b.flush()
		time.Sleep(50 * time.Millisecond)
	}
}

func (b *Batcher) flush() {
	if b.stats.activeFlushes.Load() >= 4 {
		return
	}

	batch := make([]AnalyticsEvent, 0, b.flushSize)
	drain:
	for len(batch) < b.flushSize {
		select {
		case event := <-b.ch:
			batch = append(batch, event)
			b.stats.queueSize.Add(-1)
		default:
			break drain
		}
	}

	if len(batch) == 0 {
		return
	}

	b.stats.activeFlushes.Add(1)
	go func() {
		defer b.stats.activeFlushes.Add(-1)
		if err := b.db.Insert(batch); err != nil {
			log.Printf("[batcher] insert failed (%d events): %v", len(batch), err)
			// Re-queue on failure (best effort)
			for _, e := range batch {
				select {
				case b.ch <- e:
					b.stats.queueSize.Add(1)
				default:
					b.dropped.Add(1)
				}
			}
		}
	}()
}

func (b *Batcher) Push(event AnalyticsEvent) {
	select {
	case b.ch <- event:
		b.stats.queueSize.Add(1)
	default:
		b.dropped.Add(1)
	}
}

func (b *Batcher) GetStats() (queueSize int64, activeFlushes int32, dropped int64) {
	return b.stats.queueSize.Load(), b.stats.activeFlushes.Load(), b.dropped.Load()
}

func formatTime() string {
	now := time.Now().UTC()
	return fmt.Sprintf("%04d-%02d-%02d %02d:%02d:%02d",
		now.Year(), now.Month(), now.Day(),
		now.Hour(), now.Minute(), now.Second())
}

func main() {
	cfg := loadConfig()

	db := NewClickhouseDB(cfg)
	if err := db.Init(); err != nil {
		log.Fatalf("[analytics] clickhouse init failed: %v", err)
	}
	log.Println("[analytics] clickhouse connected")

	batcher := NewBatcher(db, cfg.BatchMaxSize, cfg.BatchIntervalMs)
	batcher.Start()

	mux := http.NewServeMux()

	// /collect endpoint - pixel tracking
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
			Time:       formatTime(),
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

		batcher.Push(event)

		w.Header().Set("Content-Type", "image/gif")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Expires", "0")
		w.Header().Set("Pragma", "no-cache")
		w.Write(PIXEL_GIF)
	})

	// /health endpoint
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
		queueSize, activeFlushes, dropped := batcher.GetStats()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"uptime":%.1f,"queue":%d,"flushes":%d,"dropped":%d}`,
			time.Since(startTime).Seconds(), queueSize, activeFlushes, dropped)
	})

	// /recent endpoint
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
		result, err := db.Query(query)
		if err != nil {
			w.Write([]byte("[]"))
			return
		}
		json.NewEncoder(w).Encode(result)
	})

	// Static files (serve public directory)
	if _, err := os.Stat("public"); err == nil {
		fs := http.FileServer(http.Dir("public"))
		mux.Handle("/", fs)
	}

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("[analytics] listening on %s", addr)
	log.Printf("[analytics] collecting at /collect")
	log.Printf("[analytics] health at /health")
	log.Printf("[analytics] batch size: %d / interval: %dms", cfg.BatchMaxSize, cfg.BatchIntervalMs)

	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
		<-sigCh
		log.Println("[analytics] shutting down...")
		server.Shutdown(context.Background())
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[analytics] fatal: %v", err)
	}
}

var startTime = time.Now()
