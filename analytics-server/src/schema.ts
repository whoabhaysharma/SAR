export const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS ad_events (
  event       String,
  publisher   String,
  slot        String,
  ts          UInt64,
  time        DateTime,
  tag         String DEFAULT '',
  error       String DEFAULT '',
  quartile    UInt8 DEFAULT 0,
  duration    UInt32 DEFAULT 0,
  mediaCount  UInt8 DEFAULT 0,
  tagUrl      String DEFAULT '',
  progress    String DEFAULT '',
  ip          String DEFAULT '',
  userAgent   String DEFAULT '',
  referer     String DEFAULT ''
) ENGINE = MergeTree
ORDER BY (publisher, time)
TTL time + INTERVAL 90 DAY DELETE
`
