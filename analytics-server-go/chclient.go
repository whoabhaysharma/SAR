package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type chClient struct {
	host   string
	user   string
	pass   string
	client *http.Client
}

func (c *chClient) init(db string) error {
	c.exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", db))
	c.exec(fmt.Sprintf(`
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
TTL time + INTERVAL 90 DAY DELETE`, db))
	return nil
}

func (c *chClient) exec(query string) error {
	req, _ := http.NewRequest("POST", c.host, strings.NewReader(query))
	req.Header.Set("Content-Type", "text/plain")
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}
	if c.client == nil {
		c.client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (c *chClient) query(query string) ([]map[string]interface{}, error) {
	req, _ := http.NewRequest("POST", c.host, strings.NewReader(query))
	req.Header.Set("Content-Type", "text/plain")
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}
	if c.client == nil {
		c.client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	data, _ := raw["data"].([]interface{})
	result := make([]map[string]interface{}, 0, len(data))
	for _, row := range data {
		if m, ok := row.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result, nil
}
