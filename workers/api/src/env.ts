export interface Env {
  DB: D1Database;
  WHATSAPP_INGEST_QUEUE: Queue<IngestQueueMessage>;
  META_DELIVERY_QUEUE: Queue<MetaQueueMessage>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLIC_API_BASE_URL: string;
  CREDENTIAL_ENCRYPTION_KEY: string;
  PAYLOAD_ENCRYPTION_KEY: string;
  IDENTITY_HMAC_KEY: string;
  APP_ENV: string;
  META_SENDS_ENABLED: string;
  META_GRAPH_VERSION: string;
  UAZAPI_ALLOWED_HOSTS: string;
  WEB_APP_ORIGIN: string;
  RAW_RETENTION_DAYS: string;
  AUDIT_RETENTION_DAYS: string;
}

export interface IngestQueueMessage {
  kind: "ingest";
  deliveryId: string;
}

export interface MetaQueueMessage {
  kind: "meta";
  conversionId: string;
  attempt?: number;
}

export type QueuePayload = IngestQueueMessage | MetaQueueMessage;
