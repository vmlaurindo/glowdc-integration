import { decryptText, sha256Hex } from "./crypto";
import type { Env } from "./env";
import { buildMetaPayload, isRetryableMetaStatus } from "./meta";
import { recordMetaAudit } from "./operational";
import { patchRows, supabaseJson, type ConversionContext } from "./supabase";

export class RetryableDeliveryError extends Error {}

export async function deliverMetaConversion(
  env: Env,
  conversionId: string,
  attempt: number
): Promise<void> {
  if (env.META_SENDS_ENABLED !== "true") return;
  if (!/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION)) {
    throw new Error("meta_graph_version_not_pinned");
  }
  const contexts = await supabaseJson<ConversionContext[]>(env, "/rest/v1/rpc/get_meta_delivery_context", {
    method: "POST",
    body: JSON.stringify({ p_conversion_id: conversionId })
  });
  const context = contexts[0];
  if (!context || context.status === "sent") return;
  const workspaceId = await conversionWorkspace(env, conversionId);
  const phone = await decryptText(
    context.phone_cipher,
    env.CREDENTIAL_ENCRYPTION_KEY,
    `workspace:${workspaceId}:phone`
  );
  const ctwaClid = await decryptText(
    context.ctwa_clid_cipher,
    env.CREDENTIAL_ENCRYPTION_KEY,
    `workspace:${workspaceId}:ctwa`
  );
  const accessToken = await decryptText(
    context.access_token_cipher,
    env.CREDENTIAL_ENCRYPTION_KEY,
    `workspace:${workspaceId}:meta`
  );
  const payload = await buildMetaPayload({
    eventId: context.event_id,
    occurredAt: context.occurred_at,
    phone,
    ctwaClid,
    pageId: context.page_id,
    sourceId: context.source_id,
    testEventCode: context.test_event_code
  });
  const response = await fetch(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(context.dataset_id)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  const responseText = (await response.text()).slice(0, 20_000);
  const responseHash = await sha256Hex(responseText);
  const retryable = isRetryableMetaStatus(response.status);
  await recordMetaAudit(env, {
    conversionId,
    eventId: context.event_id,
    attempt,
    httpStatus: response.status,
    outcome: response.ok ? "sent" : retryable ? "retry" : "terminal",
    responseHash,
    errorCode: response.ok ? null : `meta_http_${response.status}`
  });
  if (response.ok) {
    await patchRows(env, "conversion_events", `id=eq.${encodeURIComponent(conversionId)}`, {
      status: "sent", sent_at: new Date().toISOString(), last_error_code: null
    });
    return;
  }
  if (retryable) {
    await patchRows(env, "conversion_events", `id=eq.${encodeURIComponent(conversionId)}`, {
      status: "retrying", last_error_code: `meta_http_${response.status}`
    });
    throw new RetryableDeliveryError(`meta_http_${response.status}`);
  }
  await patchRows(env, "conversion_events", `id=eq.${encodeURIComponent(conversionId)}`, {
    status: "failed_terminal", last_error_code: `meta_http_${response.status}`
  });
}

async function conversionWorkspace(env: Env, conversionId: string): Promise<string> {
  const rows = await supabaseJson<Array<{ workspace_id: string }>>(
    env,
    `/rest/v1/conversion_events?id=eq.${encodeURIComponent(conversionId)}&select=workspace_id&limit=1`
  );
  if (!rows[0]) throw new Error("conversion_not_found");
  return rows[0].workspace_id;
}

