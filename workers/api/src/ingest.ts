import { buildConversionEventId, normalizeUazapiInbound } from "@glowdc/contracts";
import { decryptText, encryptText, hmacHex, sha256Hex } from "./crypto";
import type { Env } from "./env";
import { completeDelivery, loadDelivery } from "./operational";
import { findConnection, supabaseJson } from "./supabase";

interface IngestResult {
  conversion_id: string | null;
  outcome: "created" | "duplicate" | "updated";
}

export async function processDelivery(env: Env, deliveryId: string): Promise<void> {
  const delivery = await loadDelivery(env, deliveryId);
  if (!delivery) return;
  const connection = await findConnection(env, delivery.connection_id);
  if (!connection || connection.status === "suspended") {
    await completeDelivery(env, deliveryId, "invalid_payload", "connection_unavailable");
    return;
  }
  const payloadText = await decryptText(
    delivery.payload_cipher,
    env.PAYLOAD_ENCRYPTION_KEY,
    `delivery:${delivery.id}`
  );
  const normalized = normalizeUazapiInbound(JSON.parse(payloadText));
  if (["ignored_outbound", "ignored_group", "invalid_payload"].includes(normalized.classification)) {
    await completeDelivery(env, deliveryId, normalized.classification);
    return;
  }
  if (!normalized.phone || !normalized.externalMessageId) {
    await completeDelivery(env, deliveryId, "invalid_payload", "missing_identity");
    return;
  }

  const workspaceAad = `workspace:${connection.workspace_id}`;
  const phoneHmac = await hmacHex(normalized.phone, env.IDENTITY_HMAC_KEY);
  const phoneCipher = await encryptText(normalized.phone, env.CREDENTIAL_ENCRYPTION_KEY, `${workspaceAad}:phone`);
  const nameCipher = normalized.displayName
    ? await encryptText(normalized.displayName, env.CREDENTIAL_ENCRYPTION_KEY, `${workspaceAad}:name`)
    : null;
  const ctwaHmac = normalized.ctwaClid
    ? await hmacHex(normalized.ctwaClid, env.IDENTITY_HMAC_KEY)
    : null;
  const ctwaCipher = normalized.ctwaClid
    ? await encryptText(normalized.ctwaClid, env.CREDENTIAL_ENCRYPTION_KEY, `${workspaceAad}:ctwa`)
    : null;
  const eventSeed = buildConversionEventId({
    workspaceId: connection.workspace_id,
    connectionId: connection.id,
    externalMessageId: normalized.externalMessageId
  });
  const eventId = await sha256Hex(eventSeed);
  const createConversion = normalized.classification === "paid_complete";
  const conversionStatus = connection.meta_mode === "active" && env.META_SENDS_ENABLED === "true"
    ? "queued"
    : "observed";

  const rows = await supabaseJson<IngestResult[]>(env, "/rest/v1/rpc/ingest_whatsapp_event", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: connection.workspace_id,
      p_connection_id: connection.id,
      p_external_message_id: normalized.externalMessageId,
      p_event_id: eventId,
      p_occurred_at: normalized.occurredAt,
      p_classification: normalized.classification,
      p_phone_hmac: phoneHmac,
      p_phone_cipher: phoneCipher,
      p_name_cipher: nameCipher,
      p_ctwa_hmac: ctwaHmac,
      p_ctwa_cipher: ctwaCipher,
      p_source_id: normalized.sourceId,
      p_source_url: normalized.sourceUrl,
      p_headline: normalized.headline,
      p_create_conversion: createConversion,
      p_conversion_status: conversionStatus
    })
  });
  const result = rows[0];
  if (result?.conversion_id && conversionStatus === "queued") {
    await env.META_DELIVERY_QUEUE.send({ kind: "meta", conversionId: result.conversion_id, attempt: 1 });
  }
  await completeDelivery(env, deliveryId, result?.outcome === "duplicate" ? "duplicate" : normalized.classification);
}

