CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  ingress_key TEXT NOT NULL,
  external_message_id TEXT,
  classification TEXT NOT NULL DEFAULT 'pending',
  payload_cipher TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  last_error_code TEXT,
  UNIQUE(connection_id, ingress_key)
);

CREATE INDEX IF NOT EXISTS deliveries_received_at_idx ON deliveries(received_at);
CREATE INDEX IF NOT EXISTS deliveries_pending_idx ON deliveries(processed_at, received_at);

CREATE TABLE IF NOT EXISTS meta_delivery_audits (
  id TEXT PRIMARY KEY,
  conversion_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  http_status INTEGER,
  outcome TEXT NOT NULL,
  response_hash TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS meta_audits_created_at_idx ON meta_delivery_audits(created_at);
CREATE INDEX IF NOT EXISTS meta_audits_conversion_idx ON meta_delivery_audits(conversion_id);

