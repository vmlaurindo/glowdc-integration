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
import { findConnection, isPlatformAdmin, patchRows, requireWorkspaceMember, supabaseAuthJson, supabaseJson, workspaceRole, writeAudit } from "./supabase";
import { installUazapiWebhook, testUazapiConnection, type UazapiCredentials } from "./uazapi";
import { auditDetail, canManageRole, isUuid, isWorkspaceRole } from "./admin-policy";

type AppBindings = { Bindings: Env; Variables: AuthVariables };
const app = new Hono<AppBindings>();

app.use("/api/*", async (context, next) => cors({
  origin: context.env.WEB_APP_ORIGIN,
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
  if (!await isPlatformAdmin(context.env, context.get("userId"))) {
    return context.json({ error: "workspace_access_denied" }, 403);
  }
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

app.get("/api/admin/context", async (context) => {
  const userId = context.get("userId");
  const [platformAdmin, memberships] = await Promise.all([
    isPlatformAdmin(context.env, userId),
    supabaseJson<Array<{ workspace_id: string; role: string }>>(
      context.env,
      `/rest/v1/workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=workspace_id,role`
    )
  ]);
  const workspaceAdminIds = memberships
    .filter((entry) => entry.role === "owner" || entry.role === "admin")
    .map((entry) => entry.workspace_id);
  return context.json({ data: {
    platformAdmin,
    canAccessAdmin: platformAdmin || workspaceAdminIds.length > 0,
    canCreateWorkspace: platformAdmin,
    workspaceIds: workspaceAdminIds
  } });
});

app.get("/api/admin/workspaces", async (context) => {
  const userId = context.get("userId");
  const platformAdmin = await isPlatformAdmin(context.env, userId);
  let allowedIds: string[] = [];
  if (!platformAdmin) {
    const memberships = await supabaseJson<Array<{ workspace_id: string }>>(
      context.env,
      `/rest/v1/workspace_members?user_id=eq.${encodeURIComponent(userId)}` +
        "&role=in.(owner,admin)&select=workspace_id"
    );
    allowedIds = memberships.map((entry) => entry.workspace_id);
    if (!allowedIds.length) return context.json({ error: "workspace_access_denied" }, 403);
  }
  const workspaceFilter = platformAdmin ? "" : `&id=in.(${allowedIds.join(",")})`;
  const workspaces = await supabaseJson<Array<{
    id: string; name: string; slug: string; created_at: string; updated_at: string;
  }>>(context.env,
    `/rest/v1/workspaces?select=id,name,slug,created_at,updated_at${workspaceFilter}&order=created_at.asc`
  );
  const ids = workspaces.map((entry) => entry.id);
  const memberships = ids.length ? await supabaseJson<Array<{ workspace_id: string; role: string }>>(
    context.env,
    `/rest/v1/workspace_members?workspace_id=in.(${ids.join(",")})&select=workspace_id,role`
  ) : [];
  const ownRoles = new Map(allowedIds.length ? (await supabaseJson<Array<{ workspace_id: string; role: string }>>(
    context.env,
    `/rest/v1/workspace_members?user_id=eq.${encodeURIComponent(userId)}&workspace_id=in.(${ids.join(",")})&select=workspace_id,role`
  )).map((entry) => [entry.workspace_id, entry.role]) : []);
  return context.json({ data: workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
    memberCount: memberships.filter((entry) => entry.workspace_id === workspace.id).length,
    canEdit: platformAdmin || ownRoles.get(workspace.id) === "owner"
  })), canCreate: platformAdmin });
});

app.post("/api/admin/workspaces", async (context) => {
  if (!await isPlatformAdmin(context.env, context.get("userId"))) {
    return context.json({ error: "workspace_access_denied" }, 403);
  }
  const parsed = createWorkspaceSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_workspace", fields: parsed.error.flatten().fieldErrors }, 400);
  try {
    const rows = await supabaseJson<Array<Record<string, unknown>>>(context.env, "/rest/v1/rpc/create_workspace", {
      method: "POST",
      body: JSON.stringify({ p_name: parsed.data.name, p_slug: parsed.data.slug, p_owner_id: context.get("userId") })
    });
    return context.json({ data: rows[0] ?? null }, 201);
  } catch (error) {
    if (isUniqueConflict(error)) return context.json({ error: "workspace_slug_conflict" }, 409);
    throw error;
  }
});

app.patch("/api/admin/workspaces/:id", async (context) => {
  const workspaceId = context.req.param("id");
  if (!isUuid(workspaceId)) return context.json({ error: "workspace_not_found" }, 404);
  const platformAdmin = await isPlatformAdmin(context.env, context.get("userId"));
  const role = platformAdmin ? "platform_admin" : await workspaceRole(context.env, workspaceId, context.get("userId"));
  if (role !== "platform_admin" && role !== "owner") return context.json({ error: "workspace_access_denied" }, 403);
  const body = await context.req.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 100) return context.json({ error: "invalid_workspace" }, 400);
  try {
    const rows = await supabaseJson<Record<string, unknown>>(context.env, "/rest/v1/rpc/admin_update_workspace_name", {
      method: "POST",
      body: JSON.stringify({ p_workspace_id: workspaceId, p_actor_user_id: context.get("userId"), p_name: name })
    });
    return context.json({ data: rows });
  } catch (error) {
    if (isDatabaseError(error, "workspace_not_found")) return context.json({ error: "workspace_not_found" }, 404);
    throw error;
  }
});

app.get("/api/admin/workspaces/:id/members", async (context) => {
  const workspaceId = context.req.param("id");
  if (!isUuid(workspaceId)) return context.json({ error: "workspace_not_found" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const rows = await supabaseJson<Array<{ user_id: string; role: string; created_at: string }>>(
    context.env,
    `/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      "&select=user_id,role,created_at&order=created_at.asc&limit=200"
  );
  const authUsers = await loadAuthUsers(context.env, rows.map((row) => row.user_id));
  const userMap = new Map(authUsers.map((user) => [user.id, user]));
  return context.json({ canManageAll: role !== "admin", data: rows.map((member) => {
    const user = userMap.get(member.user_id);
    return {
      userId: member.user_id,
      email: user?.email ?? "Conta indisponível",
      role: member.role,
      status: user?.email_confirmed_at ? "active" : "pending",
      createdAt: member.created_at
    };
  }) });
});

app.post("/api/admin/workspaces/:id/members", async (context) => {
  const workspaceId = context.req.param("id");
  if (!isUuid(workspaceId)) return context.json({ error: "workspace_not_found" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const body = await context.req.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const memberRole = typeof body?.role === "string" ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isWorkspaceRole(memberRole)) {
    return context.json({ error: "invalid_member" }, 400);
  }
  if (!canManageRole(role, memberRole)) return context.json({ error: "workspace_access_denied" }, 403);
  const existingId = await supabaseJson<string | null>(context.env, "/rest/v1/rpc/admin_find_auth_user_by_email", {
    method: "POST", body: JSON.stringify({ p_email: email })
  });
  let invitedUser: AuthUser | null = null;
  if (existingId) {
    const current = await workspaceRole(context.env, workspaceId, existingId);
    if (current) return context.json({ error: "member_already_exists" }, 409);
    invitedUser = (await loadAuthUsers(context.env, [existingId]))[0] ?? { id: existingId };
  }
  if (!invitedUser) {
    try {
      invitedUser = await supabaseAuthJson<AuthUser>(context.env,
        `/invite?redirect_to=${encodeURIComponent(`${context.env.WEB_APP_ORIGIN}/glowdc/login`)}`,
        { method: "POST", body: JSON.stringify({ email, data: {} }) }
      );
    } catch {
      return context.json({ error: "invite_failed" }, 502);
    }
  }
  try {
    const added = await supabaseJson<boolean>(context.env, "/rest/v1/rpc/admin_add_workspace_member", {
      method: "POST",
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_target_user_id: invitedUser.id,
        p_actor_user_id: context.get("userId"),
        p_role: memberRole
      })
    });
    if (!added) return context.json({ error: "member_already_exists" }, 409);
    return context.json({ data: { userId: invitedUser.id, email, role: memberRole, status: invitedUser.email_confirmed_at ? "active" : "pending" } }, 201);
  } catch (error) {
    if (isDatabaseError(error, "workspace_not_found")) return context.json({ error: "workspace_not_found" }, 404);
    throw error;
  }
});

app.patch("/api/admin/workspaces/:id/members/:userId", async (context) => {
  const workspaceId = context.req.param("id");
  const targetUserId = context.req.param("userId");
  if (!isUuid(workspaceId) || !isUuid(targetUserId)) return context.json({ error: "member_not_found" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const body = await context.req.json().catch(() => null) as { role?: unknown } | null;
  const nextRole = typeof body?.role === "string" ? body.role : "";
  const previousRole = await workspaceRole(context.env, workspaceId, targetUserId);
  if (!previousRole) return context.json({ error: "member_not_found" }, 404);
  if (!isWorkspaceRole(nextRole) || !canManageRole(role, nextRole) || !canManageRole(role, previousRole)) {
    return context.json({ error: "workspace_access_denied" }, 403);
  }
  try {
    await supabaseJson(context.env, "/rest/v1/rpc/admin_set_member_role", {
      method: "POST",
      body: JSON.stringify({ p_workspace_id: workspaceId, p_target_user_id: targetUserId, p_actor_user_id: context.get("userId"), p_role: nextRole })
    });
    return context.json({ data: { updated: true } });
  } catch (error) {
    if (isDatabaseError(error, "last_owner_required")) return context.json({ error: "last_owner_required" }, 409);
    if (isDatabaseError(error, "member_not_found")) return context.json({ error: "member_not_found" }, 404);
    throw error;
  }
});

app.delete("/api/admin/workspaces/:id/members/:userId", async (context) => {
  const workspaceId = context.req.param("id");
  const targetUserId = context.req.param("userId");
  if (!isUuid(workspaceId) || !isUuid(targetUserId)) return context.json({ error: "member_not_found" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const targetRole = await workspaceRole(context.env, workspaceId, targetUserId);
  if (!targetRole) return context.json({ error: "member_not_found" }, 404);
  if (!canManageRole(role, targetRole)) return context.json({ error: "workspace_access_denied" }, 403);
  try {
    await supabaseJson(context.env, "/rest/v1/rpc/admin_revoke_workspace_member", {
      method: "POST",
      body: JSON.stringify({ p_workspace_id: workspaceId, p_target_user_id: targetUserId, p_actor_user_id: context.get("userId") })
    });
    return context.json({ data: { revoked: true } });
  } catch (error) {
    if (isDatabaseError(error, "last_owner_required")) return context.json({ error: "last_owner_required" }, 409);
    throw error;
  }
});

app.post("/api/admin/workspaces/:id/members/:userId/resend", async (context) => {
  const workspaceId = context.req.param("id");
  const targetUserId = context.req.param("userId");
  if (!isUuid(workspaceId) || !isUuid(targetUserId)) return context.json({ error: "invite_not_pending" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const targetRole = await workspaceRole(context.env, workspaceId, targetUserId);
  if (!targetRole || !canManageRole(role, targetRole)) return context.json({ error: "invite_not_pending" }, 409);
  const authUser = (await loadAuthUsers(context.env, [targetUserId]))[0];
  if (!authUser?.email || authUser.email_confirmed_at || !authUser.invited_at) {
    return context.json({ error: "invite_not_pending" }, 409);
  }
  try {
    await supabaseAuthJson(context.env, "/resend", {
      method: "POST",
      body: JSON.stringify({ type: "signup", email: authUser.email, options: { emailRedirectTo: `${context.env.WEB_APP_ORIGIN}/glowdc/login` } })
    });
  } catch {
    return context.json({ error: "invite_failed" }, 502);
  }
  await writeAudit(context.env, {
    workspaceId, actorUserId: context.get("userId"), action: "member.invite_resent",
    targetType: "workspace_member", targetId: targetUserId
  });
  return context.json({ data: { sent: true } });
});

app.get("/api/admin/workspaces/:id/audit", async (context) => {
  const workspaceId = context.req.param("id");
  if (!isUuid(workspaceId)) return context.json({ error: "workspace_not_found" }, 404);
  const role = await workspaceAdminRole(context.env, workspaceId, context.get("userId"));
  if (!role) return context.json({ error: "workspace_access_denied" }, 403);
  const entries = await supabaseJson<Array<{
    id: string; actor_user_id: string | null; action: string; target_type: string;
    target_id: string | null; metadata: Record<string, unknown>; created_at: string;
  }>>(context.env,
    `/rest/v1/audit_logs?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      "&select=id,actor_user_id,action,target_type,target_id,metadata,created_at&order=created_at.desc,id.desc&limit=50"
  );
  const relevantIds = [...new Set(entries.flatMap((entry) => [entry.actor_user_id, entry.target_type === "workspace_member" ? entry.target_id : null].filter((id): id is string => Boolean(id))))];
  const users = await loadAuthUsers(context.env, relevantIds);
  const userMap = new Map(users.filter((user) => relevantIds.includes(user.id)).map((user) => [user.id, user.email ?? "Conta indisponível"]));
  return context.json({ data: entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.created_at,
    actorEmail: entry.actor_user_id ? userMap.get(entry.actor_user_id) ?? "Conta indisponível" : "Sistema",
    action: entry.action,
    targetType: entry.target_type === "workspace_member" ? "integrante" : entry.target_type,
    targetLabel: entry.target_type === "workspace_member" && entry.target_id
      ? userMap.get(entry.target_id) ?? entry.target_id.slice(0, 8)
      : entry.target_id?.slice(0, 8) ?? "—",
    detail: auditDetail(entry.action, entry.metadata)
  })), nextCursor: null });
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

type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
};

async function loadAuthUsers(env: Env, userIds: string[]): Promise<AuthUser[]> {
  const uniqueIds = [...new Set(userIds)];
  const all: AuthUser[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 10) {
    const batch = uniqueIds.slice(offset, offset + 10);
    const users = await Promise.all(batch.map(async (userId) => {
      const response = await supabaseAuthJson<AuthUser | { user?: AuthUser }>(
        env,
        `/admin/users/${encodeURIComponent(userId)}`
      );
      return "user" in response && response.user ? response.user : response as AuthUser;
    }));
    all.push(...users);
  }
  return all;
}

async function workspaceAdminRole(env: Env, workspaceId: string, userId: string): Promise<string | null> {
  if (await isPlatformAdmin(env, userId)) return "platform_admin";
  const role = await workspaceRole(env, workspaceId, userId);
  return role === "owner" || role === "admin" ? role : null;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && /supabase_409/.test(error.message);
}

function isDatabaseError(error: unknown, code: string): boolean {
  if (!(error instanceof Error)) return false;
  const detail = (error as Error & { detail?: string }).detail ?? "";
  try {
    const message = JSON.parse(detail) as { message?: string; details?: string; hint?: string };
    return [message.message, message.details, message.hint].some((value) => value?.includes(code)) || detail.includes(code);
  } catch {
    return detail.includes(code);
  }
}

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
