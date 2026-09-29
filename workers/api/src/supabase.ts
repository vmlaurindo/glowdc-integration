import type { Env } from "./env";

export interface ConnectionRow {
  id: string;
  workspace_id: string;
  label: string;
  base_url: string;
  instance_id: string | null;
  credentials_cipher: string;
  status: string;
  webhook_installed_at: string | null;
  last_tested_at: string | null;
  meta_mode: "observation" | "active";
}

export interface ConversionContext {
  conversion_id: string;
  event_id: string;
  occurred_at: string;
  status: string;
  phone_cipher: string;
  ctwa_clid_cipher: string;
  source_id: string;
  dataset_id: string;
  page_id: string;
  access_token_cipher: string;
  test_event_code: string | null;
}

export async function supabaseJson<T>(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`supabase_${response.status}`);
    Object.assign(error, { status: response.status, detail: text.slice(0, 500) });
    throw error;
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function findConnection(env: Env, connectionId: string): Promise<ConnectionRow | null> {
  const rows = await supabaseJson<ConnectionRow[]>(
    env,
    `/rest/v1/provider_connections?id=eq.${encodeURIComponent(connectionId)}&select=*&limit=1`
  );
  return rows[0] ?? null;
}

export async function requireWorkspaceMember(
  env: Env,
  workspaceId: string,
  userId: string,
  allowedRoles: string[] = ["owner", "admin", "operator", "viewer"]
): Promise<void> {
  const rows = await supabaseJson<Array<{ role: string }>>(
    env,
    `/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`
  );
  if (!rows[0] || !allowedRoles.includes(rows[0].role)) throw new Error("workspace_access_denied");
}

export async function patchRows(
  env: Env,
  table: string,
  filter: string,
  body: Record<string, unknown>
): Promise<void> {
  await supabaseJson(env, `/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
}

export async function writeAudit(env: Env, input: {
  workspaceId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await supabaseJson(env, "/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {}
    })
  });
}
