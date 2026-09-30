import { createConnectionSchema, createWorkspaceSchema, activationSchema, metaDestinationSchema, normalizeUazapiInbound } from "@glowdc/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { encryptText, decryptText, constantTimeEqual, sha256Hex } from "./crypto";
import { requireAuth, type AuthVariables } from "./auth";
import type { Env, QueuePayload } from "./env";
import { processDelivery } from "./ingest";
import { deliverMetaConversion, RetryableDeliveryError } from "./meta-delivery";
import { insertDelivery, loadDelivery, resetDelivery } from "./operational";
import { assertAllowedProviderUrl, extractWebhookToken, sanitizePayload } from "./security";
import { findConnection, patchRows, requireWorkspaceMember, supabaseJson, writeAudit } from "./supabase";
import { installUazapiWebhook, testUazapiConnection, type UazapiCredentials } from "./uazapi";

type AppBindings = { Bindings: Env; Variables: AuthVariables };
const app = new Hono<AppBindings>();

app.use("/api/*", async (context, next) => cors({
  origin: context.env.WEB_APP_ORIGIN,
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  credentials: true
})(context, next));
app.use("/api/*", requireAuth);

app.get("/health", (context) => context.json({ status: "ok", service: "glowdc-integration-api" }));

app.get("/api/workspaces", async (context) => {
  const userId = context.get("userId");
  const memberships = await supabaseJson<Array<{ role: string; workspaces: unknown }>>(
    context.env,
    `/rest/v1/workspace_members?user_id=eq.${encodeURIComponent(userId)}` +
      "&select=role,workspaces(id,name,slug)"
  );
  return context.json({ data: memberships });
});

app.post("/api/workspaces", async (context) => {
  const parsed = createWorkspaceSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_workspace", fields: parsed.error.flatten().fieldErrors }, 400);
  const rows = await supabaseJson(context.env, "/rest/v1/rpc/create_workspace", {
    method: "POST",
    body: JSON.stringify({
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_owner_id: context.get("userId")
    })
  });
  return context.json({ data: rows }, 201);
});

app.get("/api/connections", async (context) => {
  const workspaceId = context.req.query("workspaceId");
  if (!workspaceId) return context.json({ error: "workspace_id_required" }, 400);
  await requireWorkspaceMember(context.env, workspaceId, context.get("userId"));
  const rows = await supabaseJson(context.env,
    `/rest/v1/provider_connections?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
    "&select=id,label,base_url,instance_id,status,meta_mode,webhook_installed_at,last_tested_at,created_at&order=created_at.desc"
  );
  return context.json({ data: rows });
});

app.post("/api/connections", async (context) => {
  const parsed = createConnectionSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_connection", fields: parsed.error.flatten().fieldErrors }, 400);
  await requireWorkspaceMember(context.env, parsed.data.workspaceId, context.get("userId"), ["owner", "admin", "operator"]);
  let baseUrl: string;
  try {
    baseUrl = assertAllowedProviderUrl(parsed.data.baseUrl, context.env.UAZAPI_ALLOWED_HOSTS)
      .toString().replace(/\/$/, "");
  } catch (error) {
    return context.json({ error: errorCode(error) }, 400);
  }
  const id = crypto.randomUUID();
  const credentialsCipher = await encryptText(
    JSON.stringify({ token: parsed.data.token }),
    context.env.CREDENTIAL_ENCRYPTION_KEY,
    `connection:${id}:credentials`
  );
  const rows = await supabaseJson<Array<Record<string, unknown>>>(context.env, "/rest/v1/provider_connections", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      workspace_id: parsed.data.workspaceId,
      label: parsed.data.label,
      provider: "uazapi",
      base_url: baseUrl,
      instance_id: parsed.data.instanceId ?? null,
      credentials_cipher: credentialsCipher,
      status: "credentials_saved",
      meta_mode: "observation",
      created_by: context.get("userId")
    })
  });
  const row = rows[0] ?? { id, label: parsed.data.label, status: "credentials_saved" };
  delete row.credentials_cipher;
  await writeAudit(context.env, {
    workspaceId: parsed.data.workspaceId,
    actorUserId: context.get("userId"),
    action: "uazapi.connection.created",
    targetType: "provider_connection",
    targetId: id
  });
  return context.json({ data: row }, 201);
});

app.post("/api/connections/:id/test", async (context) => {
  const connection = await authorizedConnection(context, ["owner", "admin", "operator"]);
  if (connection instanceof Response) return connection;
  const credentials = await connectionCredentials(context.env, connection.id, connection.credentials_cipher);
  const result = await testUazapiConnection(connection.base_url, context.env.UAZAPI_ALLOWED_HOSTS, credentials);
  await patchRows(context.env, "provider_connections", `id=eq.${connection.id}`, {
    status: result.connected ? "connected" : "needs_attention",
    last_tested_at: new Date().toISOString(),
    last_error_code: result.connected ? null : `uazapi_http_${result.status}`
  });
  await writeAudit(context.env, {
    workspaceId: connection.workspace_id, actorUserId: context.get("userId"),
    action: "uazapi.connection.tested", targetType: "provider_connection", targetId: connection.id,
    metadata: { connected: result.connected, httpStatus: result.status }
  });
  return context.json({ data: { connected: result.connected, status: result.status } }, result.connected ? 200 : 422);
});

app.post("/api/connections/:id/webhook", async (context) => {
  const connection = await authorizedConnection(context, ["owner", "admin", "operator"]);
  if (connection instanceof Response) return connection;
  const credentials = await connectionCredentials(context.env, connection.id, connection.credentials_cipher);
  const webhookUrl = `${context.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/webhooks/uazapi/${connection.id}`;
  try {
    await installUazapiWebhook(connection.base_url, context.env.UAZAPI_ALLOWED_HOSTS, credentials, webhookUrl);
    await patchRows(context.env, "provider_connections", `id=eq.${connection.id}`, {
      status: "observing", webhook_installed_at: new Date().toISOString(), last_error_code: null
    });
    await writeAudit(context.env, {
      workspaceId: connection.workspace_id, actorUserId: context.get("userId"),
      action: "uazapi.webhook.installed", targetType: "provider_connection", targetId: connection.id
    });
    return context.json({ data: { installed: true, webhookUrl } });
  } catch (error) {
    await patchRows(context.env, "provider_connections", `id=eq.${connection.id}`, {
      status: "needs_webhook", last_error_code: errorCode(error)
    });
    return context.json({
      error: "automatic_webhook_failed",
      fallback: { webhookUrl, events: ["messages", "connection"], exclude: ["fromMeYes", "isGroupYes"] }
    }, 422);
  }
});

app.patch("/api/connections/:id/activation", async (context) => {
  const connection = await authorizedConnection(context, ["owner", "admin"]);
  if (connection instanceof Response) return connection;
  const parsed = activationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_activation" }, 400);
  if (parsed.data.active && !connection.webhook_installed_at) {
    return context.json({ error: "webhook_not_installed" }, 409);
  }
  if (parsed.data.active && !connection.last_tested_at) {
    return context.json({ error: "connection_not_tested" }, 409);
  }
  if (parsed.data.active) {
    const destinations = await supabaseJson<Array<{ id: string }>>(
      context.env,
      `/rest/v1/meta_destinations?workspace_id=eq.${encodeURIComponent(connection.workspace_id)}` +
        "&enabled=eq.true&select=id&limit=1"
    );
    if (!destinations[0]) return context.json({ error: "meta_destination_missing" }, 409);
  }
  await patchRows(context.env, "provider_connections", `id=eq.${connection.id}`, {
    meta_mode: parsed.data.active ? "active" : "observation",
    status: parsed.data.active ? "active" : "observing"
  });
  await writeAudit(context.env, {
    workspaceId: connection.workspace_id, actorUserId: context.get("userId"),
    action: parsed.data.active ? "meta.delivery.activated" : "meta.delivery.observation_enabled",
    targetType: "provider_connection", targetId: connection.id
  });
  return context.json({ data: { active: parsed.data.active } });
});

app.post("/api/meta-destinations", async (context) => {
  const parsed = metaDestinationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_meta_destination", fields: parsed.error.flatten().fieldErrors }, 400);
  await requireWorkspaceMember(context.env, parsed.data.workspaceId, context.get("userId"), ["owner", "admin"]);
  const accessTokenCipher = await encryptText(
    parsed.data.accessToken,
    context.env.CREDENTIAL_ENCRYPTION_KEY,
    `workspace:${parsed.data.workspaceId}:meta`
  );
  await supabaseJson(context.env, "/rest/v1/meta_destinations?on_conflict=workspace_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      workspace_id: parsed.data.workspaceId,
      dataset_id: parsed.data.datasetId,
      page_id: parsed.data.pageId,
      access_token_cipher: accessTokenCipher,
      test_event_code: parsed.data.testEventCode ?? null,
      enabled: true,
      updated_by: context.get("userId")
    })
  });
  await writeAudit(context.env, {
    workspaceId: parsed.data.workspaceId, actorUserId: context.get("userId"),
    action: "meta.destination.configured", targetType: "meta_destination"
  });
  return context.json({ data: { configured: true } }, 201);
});

app.get("/api/leads", async (context) => {
  const workspaceId = context.req.query("workspaceId");
  if (!workspaceId) return context.json({ error: "workspace_id_required" }, 400);
  await requireWorkspaceMember(context.env, workspaceId, context.get("userId"));
  const rows = await supabaseJson(context.env,
    `/rest/v1/leads?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
    "&select=id,status,first_seen_at,last_seen_at,last_classification,contacts(display_name_hint),attributions(source_id,headline),conversion_events(status,event_id)&order=last_seen_at.desc&limit=100"
  );
  return context.json({ data: rows });
});

app.get("/api/operations", async (context) => {
  const workspaceId = context.req.query("workspaceId");
  if (!workspaceId) return context.json({ error: "workspace_id_required" }, 400);
  await requireWorkspaceMember(context.env, workspaceId, context.get("userId"));
  const rows = await supabaseJson(context.env,
    `/rest/v1/conversion_events?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
    "&select=id,event_id,status,occurred_at,sent_at,last_error_code,leads(last_classification)&order=occurred_at.desc&limit=100"
  );
  return context.json({ data: rows });
});

app.post("/api/deliveries/:id/retry", async (context) => {
  const deliveryId = context.req.param("id");
  if (!deliveryId) return context.json({ error: "delivery_id_required" }, 400);
  const delivery = await loadDelivery(context.env, deliveryId);
  if (!delivery) return context.json({ error: "delivery_not_found" }, 404);
  const connection = await findConnection(context.env, delivery.connection_id);
  if (!connection) return context.json({ error: "connection_not_found" }, 404);
  await requireWorkspaceMember(context.env, connection.workspace_id, context.get("userId"), ["owner", "admin", "operator"]);
  await resetDelivery(context.env, delivery.id);
  await context.env.WHATSAPP_INGEST_QUEUE.send({ kind: "ingest", deliveryId: delivery.id });
  await writeAudit(context.env, {
    workspaceId: connection.workspace_id, actorUserId: context.get("userId"),
    action: "delivery.requeued", targetType: "delivery", targetId: delivery.id
  });
  return context.json({ data: { queued: true } }, 202);
});

app.post("/api/conversions/:id/retry", async (context) => {
  if (context.env.META_SENDS_ENABLED !== "true") return context.json({ error: "meta_sends_disabled" }, 409);
  const conversionId = context.req.param("id");
  if (!conversionId) return context.json({ error: "conversion_id_required" }, 400);
  const rows = await supabaseJson<Array<{ id: string; workspace_id: string; status: string }>>(
    context.env,
    `/rest/v1/conversion_events?id=eq.${encodeURIComponent(conversionId)}` +
      "&select=id,workspace_id,status&limit=1"
  );
  const conversion = rows[0];
  if (!conversion) return context.json({ error: "conversion_not_found" }, 404);
  await requireWorkspaceMember(context.env, conversion.workspace_id, context.get("userId"), ["owner", "admin"]);
  if (conversion.status === "sent") return context.json({ data: { queued: false, reason: "already_sent" } });
  await patchRows(context.env, "conversion_events", `id=eq.${conversion.id}`, {
    status: "queued", last_error_code: null
  });
  await context.env.META_DELIVERY_QUEUE.send({ kind: "meta", conversionId: conversion.id, attempt: 1 });
  await writeAudit(context.env, {
    workspaceId: conversion.workspace_id, actorUserId: context.get("userId"),
    action: "meta.conversion.requeued", targetType: "conversion_event", targetId: conversion.id
  });
  return context.json({ data: { queued: true } }, 202);
});

app.post("/webhooks/uazapi/:connectionId", async (context) => {
  const contentLength = Number(context.req.header("content-length") ?? 0);
  if (contentLength > 512_000) return context.json({ error: "payload_too_large" }, 413);
  const text = await context.req.text();
  if (text.length > 512_000) return context.json({ error: "payload_too_large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return context.json({ error: "invalid_json" }, 400); }
  const connection = await findConnection(context.env, context.req.param("connectionId"));
  if (!connection || connection.status === "suspended") return context.json({ error: "not_found" }, 404);
  const credentials = await connectionCredentials(context.env, connection.id, connection.credentials_cipher);
  const suppliedToken = extractWebhookToken(payload);
  if (!suppliedToken || !constantTimeEqual(suppliedToken, credentials.token)) {
    return context.json({ error: "invalid_webhook_token" }, 401);
  }
  const sanitized = sanitizePayload(payload);
  const serialized = JSON.stringify(sanitized);
  const payloadHash = await sha256Hex(serialized);
  const normalized = normalizeUazapiInbound(sanitized);
  const ingressKey = normalized.externalMessageId ?? payloadHash;
  const id = crypto.randomUUID();
  const payloadCipher = await encryptText(serialized, context.env.PAYLOAD_ENCRYPTION_KEY, `delivery:${id}`);
  const delivery = await insertDelivery(context.env, {
    id,
    connection_id: connection.id,
    ingress_key: ingressKey,
    external_message_id: normalized.externalMessageId,
    payload_cipher: payloadCipher,
    payload_hash: payloadHash
  });
  if (delivery.inserted) {
    await context.env.WHATSAPP_INGEST_QUEUE.send({ kind: "ingest", deliveryId: delivery.id });
  }
  return context.json({ accepted: true, duplicate: !delivery.inserted }, 202);
});

app.onError((error, context) => {
  console.error(JSON.stringify({ code: errorCode(error), path: context.req.path }));
  return context.json({ error: "internal_error", code: errorCode(error) }, 500);
});

async function authorizedConnection(context: Parameters<typeof requireAuth>[0], roles: string[]) {
  const connectionId = context.req.param("id");
  if (!connectionId) return context.json({ error: "connection_id_required" }, 400);
  const connection = await findConnection(context.env, connectionId);
  if (!connection) return context.json({ error: "connection_not_found" }, 404);
  await requireWorkspaceMember(context.env, connection.workspace_id, context.get("userId"), roles);
  return connection;
}

async function connectionCredentials(env: Env, id: string, cipher: string): Promise<UazapiCredentials> {
  const text = await decryptText(cipher, env.CREDENTIAL_ENCRYPTION_KEY, `connection:${id}:credentials`);
  const value = JSON.parse(text) as Partial<UazapiCredentials>;
  if (!value.token) throw new Error("connection_credentials_invalid");
  return { token: value.token };
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 100) : "unknown_error";
}

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    const routedRequest = requestWithoutBasePath(request, env.APP_BASE_PATH);
    const pathname = new URL(routedRequest.url).pathname;
    const isBackendRequest = pathname === "/health" || pathname === "/api" ||
      pathname.startsWith("/api/") || pathname.startsWith("/webhooks/");
    if (isBackendRequest) return app.fetch(routedRequest, env, executionContext);
    return env.ASSETS.fetch(routedRequest);
  },
  async queue(batch: MessageBatch<QueuePayload>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.kind === "ingest") await processDelivery(env, message.body.deliveryId);
        else await deliverMetaConversion(env, message.body.conversionId, message.attempts);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({
          code: errorCode(error), queue: batch.queue,
          retryable: error instanceof RetryableDeliveryError || message.body.kind === "ingest"
        }));
        message.retry({ delaySeconds: Math.min(300, 2 ** message.attempts * 5) });
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const rawDays = Math.max(1, Number(env.RAW_RETENTION_DAYS) || 7);
    const auditDays = Math.max(1, Number(env.AUDIT_RETENTION_DAYS) || 60);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM deliveries WHERE datetime(received_at) < datetime('now', ?)").bind(`-${rawDays} days`),
      env.DB.prepare("DELETE FROM meta_delivery_audits WHERE datetime(created_at) < datetime('now', ?)").bind(`-${auditDays} days`)
    ]);
  }
};

export function requestWithoutBasePath(request: Request, configuredBasePath: string): Request {
  const basePath = `/${configuredBasePath.trim().replace(/^\/+|\/+$/g, "")}`;
  const url = new URL(request.url);
  if (url.pathname === basePath) url.pathname = "/";
  else if (url.pathname.startsWith(`${basePath}/`)) url.pathname = url.pathname.slice(basePath.length);
  return new Request(url.toString(), request);
}
