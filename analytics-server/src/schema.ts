export const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS ad_events (
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
TTL time + INTERVAL 90 DAY DROP PARTITION
`
