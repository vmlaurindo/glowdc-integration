import type { Env } from "./env";

export interface DeliveryRow {
  id: string;
  connection_id: string;
  ingress_key: string;
  external_message_id: string | null;
  payload_cipher: string;
  payload_hash: string;
  received_at: string;
}

export async function insertDelivery(
  env: Env,
  input: Omit<DeliveryRow, "received_at">
): Promise<{ id: string; inserted: boolean }> {
  const receivedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO deliveries
      (id, connection_id, ingress_key, external_message_id, payload_cipher, payload_hash, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.id,
    input.connection_id,
    input.ingress_key,
    input.external_message_id,
    input.payload_cipher,
    input.payload_hash,
    receivedAt
  ).run();
  return { id: input.id, inserted: (result.meta.changes ?? 0) > 0 };
}

export async function loadDelivery(env: Env, deliveryId: string): Promise<DeliveryRow | null> {
  return env.DB.prepare("SELECT * FROM deliveries WHERE id = ?")
    .bind(deliveryId)
    .first<DeliveryRow>();
}

export async function completeDelivery(
  env: Env,
  deliveryId: string,
  classification: string,
  errorCode: string | null = null
): Promise<void> {
  await env.DB.prepare(
    "UPDATE deliveries SET classification = ?, processed_at = ?, last_error_code = ? WHERE id = ?"
  ).bind(classification, new Date().toISOString(), errorCode, deliveryId).run();
}

export async function resetDelivery(env: Env, deliveryId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE deliveries SET classification = 'pending', processed_at = NULL, last_error_code = NULL WHERE id = ?"
  ).bind(deliveryId).run();
}

export async function recordMetaAudit(env: Env, input: {
  conversionId: string;
  eventId: string;
  attempt: number;
  httpStatus: number | null;
  outcome: string;
  responseHash: string | null;
  errorCode: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meta_delivery_audits
      (id, conversion_id, event_id, attempt, http_status, outcome, response_hash, error_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), input.conversionId, input.eventId, input.attempt,
    input.httpStatus, input.outcome, input.responseHash, input.errorCode,
    new Date().toISOString()
  ).run();
}
