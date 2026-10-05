export const LOCAL_MOCK_QUERY = "mock-admin";
export const LOCAL_MOCK_EMAIL = "admin@maxio.example";

type MockWorkspace = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type MockMember = {
  userId: string;
  email: string;
  role: "owner" | "admin" | "operator" | "viewer";
  status: "active" | "pending";
  createdAt: string;
};

type MockAudit = {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetLabel: string;
  detail: string;
};
type MockConnection = { id: string; label: string; base_url: string; status: string; meta_mode: "observation" | "active"; webhook_installed_at: string | null; last_tested_at: string | null; last_error_code: string | null; last_error_summary: string | null; suspended_at: string | null };

type MockState = {
  workspaces: MockWorkspace[];
  members: Record<string, MockMember[]>;
  audits: Record<string, MockAudit[]>;
  connections: MockConnection[];
  account: {
    userId: string;
    name: string;
    email: string;
    photoUrl: string | null;
  };
};

const GLOW_ID = "11111111-1111-4111-8111-111111111111";
const MOCK_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function initialState(): MockState {
  return {
    workspaces: [{
      id: GLOW_ID,
      name: "GlowDC",
      slug: "glowdc",
      memberCount: 4,
      createdAt: "2026-09-29T13:20:00.000Z",
      updatedAt: "2026-09-30T11:40:00.000Z"
    }],
    members: {
      [GLOW_ID]: [
        { userId: MOCK_USER_ID, email: LOCAL_MOCK_EMAIL, role: "owner", status: "active", createdAt: "2026-09-29T13:20:00.000Z" },
        { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "operacao@maxio.example", role: "admin", status: "active", createdAt: "2026-09-29T15:35:00.000Z" },
        { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "midia@maxio.example", role: "operator", status: "active", createdAt: "2026-09-30T09:10:00.000Z" },
        { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", email: "cliente.exemplo@glowdc.test", role: "viewer", status: "pending", createdAt: "2026-09-30T12:00:00.000Z" }
      ]
    },
    audits: {
      [GLOW_ID]: [
        { id: "audit-01", createdAt: "2026-09-30T14:18:00.000Z", actorEmail: LOCAL_MOCK_EMAIL, action: "member.invited", targetType: "integrante", targetLabel: "cliente.exemplo@glowdc.test", detail: "Convite enviado com papel Viewer" },
        { id: "audit-02", createdAt: "2026-09-30T13:42:00.000Z", actorEmail: "operacao@maxio.example", action: "uazapi.connection.tested", targetType: "conexão", targetLabel: "WhatsApp comercial", detail: "Conexão confirmada" },
        { id: "audit-03", createdAt: "2026-09-30T11:40:00.000Z", actorEmail: LOCAL_MOCK_EMAIL, action: "workspace.updated", targetType: "workspace", targetLabel: "GlowDC", detail: "Nome de exibição atualizado" },
        { id: "audit-04", createdAt: "2026-09-29T16:05:00.000Z", actorEmail: LOCAL_MOCK_EMAIL, action: "uazapi.webhook.installed", targetType: "conexão", targetLabel: "WhatsApp comercial", detail: "Webhook de entrada instalado" },
        { id: "audit-05", createdAt: "2026-09-29T13:20:00.000Z", actorEmail: LOCAL_MOCK_EMAIL, action: "workspace.created", targetType: "workspace", targetLabel: "GlowDC", detail: "Workspace criado com identificador glowdc" }
      ]
    },
    connections: [{ id: "connection-demo", label: "WhatsApp comercial", base_url: "https://glowdc.exemplo.test", status: "active", meta_mode: "observation", webhook_installed_at: "2026-09-29T16:05:00.000Z", last_tested_at: "2026-09-30T13:42:00.000Z", last_error_code: null, last_error_summary: null, suspended_at: null }],
    account: { userId: MOCK_USER_ID, name: "Administração MAXIO", email: LOCAL_MOCK_EMAIL, photoUrl: null }
  };
}

export function isLocalMockUrl(url: string, development: boolean): boolean {
  if (!development) return false;
  const target = new URL(url, "http://localhost");
  const isLoopback = target.hostname === "localhost" || target.hostname === "127.0.0.1" || target.hostname === "[::1]";
  return isLoopback && target.searchParams.get(LOCAL_MOCK_QUERY) === "1";
}

export function isLocalMockMode(): boolean {
  return typeof window !== "undefined" && isLocalMockUrl(window.location.href, import.meta.env.DEV);
}

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") return {};
  try { return JSON.parse(init.body) as Record<string, unknown>; }
  catch { return {}; }
}

function mockError(code: string, status = 400): never {
  const error = new Error(code);
  Object.assign(error, { status, payload: { error: code } });
  throw error;
}

function now(): string {
  return new Date().toISOString();
}

export function createMockApi() {
  const state = initialState();

  function addAudit(workspaceId: string, input: Omit<MockAudit, "id" | "createdAt" | "actorEmail">) {
    const entries = state.audits[workspaceId] ?? [];
    entries.unshift({
      id: `audit-${crypto.randomUUID()}`,
      createdAt: now(),
      actorEmail: state.account.email,
      ...input
    });
    state.audits[workspaceId] = entries;
  }

  return async function mockApi<T>(path: string, init: RequestInit = {}): Promise<T> {
    await Promise.resolve();
    const url = new URL(path, "http://mock.local");
    const method = (init.method ?? "GET").toUpperCase();
    const body = parseBody(init);

    if (url.pathname === "/api/workspaces" && method === "GET") {
      return { data: state.workspaces.map((workspace) => ({ role: "owner", workspaces: { id: workspace.id, name: workspace.name, slug: workspace.slug } })) } as T;
    }

    if (url.pathname === "/api/admin/context" && method === "GET") {
      return { data: { platformAdmin: true, canAccessAdmin: true } } as T;
    }

    if (url.pathname === "/api/account" && method === "GET") {
      return { data: state.account } as T;
    }

    if (url.pathname === "/api/account" && method === "PATCH") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const photoUrl = body.photoUrl === null || typeof body.photoUrl === "string" ? body.photoUrl : state.account.photoUrl;
      if (name.length < 2 || !email.includes("@")) mockError("invalid_account");
      state.account = { ...state.account, name, email, photoUrl };
      for (const members of Object.values(state.members)) {
        const ownMembership = members.find((member) => member.userId === MOCK_USER_ID);
        if (ownMembership) ownMembership.email = email;
      }
      return { data: state.account } as T;
    }

    if (url.pathname === "/api/account/password" && method === "POST") {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 12) mockError("weak_password");
      return { data: { updated: true } } as T;
    }

    if (url.pathname === "/api/admin/workspaces" && method === "GET") {
      return { data: state.workspaces.map((workspace) => ({ ...workspace, canEdit: true })), canCreate: true } as T;
    }

    if (url.pathname === "/api/admin/workspaces" && method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
      if (name.length < 2 || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) mockError("invalid_workspace");
      if (state.workspaces.some((workspace) => workspace.slug === slug)) mockError("workspace_slug_conflict", 409);
      const id = crypto.randomUUID();
      const createdAt = now();
      const workspace = { id, name, slug, memberCount: 1, createdAt, updatedAt: createdAt };
      state.workspaces.push(workspace);
      state.members[id] = [{ userId: MOCK_USER_ID, email: state.account.email, role: "owner", status: "active", createdAt }];
      state.audits[id] = [];
      addAudit(id, { action: "workspace.created", targetType: "workspace", targetLabel: name, detail: `Workspace criado com identificador ${slug}` });
      return { data: workspace } as T;
    }

    const workspaceMatch = url.pathname.match(/^\/api\/admin\/workspaces\/([^/]+)$/);
    if (workspaceMatch && method === "PATCH") {
      const id = workspaceMatch[1] ?? "";
      const workspace = state.workspaces.find((item) => item.id === id);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!workspace) mockError("workspace_not_found", 404);
      if (name.length < 2) mockError("invalid_workspace");
      const previousName = workspace.name;
      workspace.name = name;
      workspace.updatedAt = now();
      addAudit(id, { action: "workspace.updated", targetType: "workspace", targetLabel: name, detail: `Nome alterado de ${previousName} para ${name}` });
      return { data: workspace } as T;
    }

    const membersMatch = url.pathname.match(/^\/api\/admin\/workspaces\/([^/]+)\/members$/);
    if (membersMatch && method === "GET") {
      const workspaceId = membersMatch[1] ?? "";
      return { data: state.members[workspaceId] ?? [] } as T;
    }
    if (membersMatch && method === "POST") {
      const workspaceId = membersMatch[1] ?? "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = typeof body.role === "string" ? body.role : "viewer";
      if (!email.includes("@") || !["owner", "admin", "operator", "viewer"].includes(role)) mockError("invalid_member");
      const members = state.members[workspaceId] ?? [];
      if (members.some((member) => member.email === email)) mockError("member_already_exists", 409);
      const member = { userId: crypto.randomUUID(), email, role: role as MockMember["role"], status: "pending" as const, createdAt: now() };
      members.push(member);
      state.members[workspaceId] = members;
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (workspace) workspace.memberCount = members.length;
      addAudit(workspaceId, { action: "member.invited", targetType: "integrante", targetLabel: email, detail: `Convite enviado com papel ${role}` });
      return { data: member } as T;
    }

    const memberMatch = url.pathname.match(/^\/api\/admin\/workspaces\/([^/]+)\/members\/([^/]+)$/);
    if (memberMatch && method === "PATCH") {
      const workspaceId = memberMatch[1] ?? "";
      const userId = memberMatch[2] ?? "";
      const role = typeof body.role === "string" ? body.role : "";
      const member = (state.members[workspaceId] ?? []).find((item) => item.userId === userId);
      if (!member || !["owner", "admin", "operator", "viewer"].includes(role)) mockError("invalid_member");
      if (member.role === "owner" && role !== "owner" && (state.members[workspaceId] ?? []).filter((item) => item.role === "owner").length === 1) mockError("last_owner_required", 409);
      const previousRole = member.role;
      member.role = role as MockMember["role"];
      addAudit(workspaceId, { action: "member.role_updated", targetType: "integrante", targetLabel: member.email, detail: `Papel alterado de ${previousRole} para ${role}` });
      return { data: member } as T;
    }
    if (memberMatch && method === "DELETE") {
      const workspaceId = memberMatch[1] ?? "";
      const userId = memberMatch[2] ?? "";
      const members = state.members[workspaceId] ?? [];
      const member = members.find((item) => item.userId === userId);
      if (!member) mockError("member_not_found", 404);
      if (member.role === "owner" && members.filter((item) => item.role === "owner").length === 1) mockError("last_owner_required", 409);
      state.members[workspaceId] = members.filter((item) => item.userId !== userId);
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (workspace) workspace.memberCount = state.members[workspaceId]?.length ?? 0;
      addAudit(workspaceId, { action: "member.revoked", targetType: "integrante", targetLabel: member.email, detail: "Acesso ao workspace revogado" });
      return { data: { revoked: true } } as T;
    }

    const resendMatch = url.pathname.match(/^\/api\/admin\/workspaces\/([^/]+)\/members\/([^/]+)\/resend$/);
    if (resendMatch && method === "POST") {
      const workspaceId = resendMatch[1] ?? "";
      const userId = resendMatch[2] ?? "";
      const member = (state.members[workspaceId] ?? []).find((item) => item.userId === userId);
      if (!member || member.status !== "pending") mockError("invite_not_pending", 409);
      addAudit(workspaceId, { action: "member.invite_resent", targetType: "integrante", targetLabel: member.email, detail: "Convite reenviado" });
      return { data: { sent: true } } as T;
    }

    const auditMatch = url.pathname.match(/^\/api\/admin\/workspaces\/([^/]+)\/audit$/);
    if (auditMatch && method === "GET") {
      return { data: state.audits[auditMatch[1] ?? ""] ?? [], nextCursor: null } as T;
    }

    if (url.pathname === "/api/connections" && method === "GET") {
      return { data: state.connections.map((connection) => ({
        ...connection,
        webhook_url: `https://app.maxio.com.br/glowdc/webhooks/uazapi/${encodeURIComponent(connection.id)}`
      })) } as T;
    }
    if (url.pathname === "/api/connections" && method === "POST") {
      const connection: MockConnection = { id: `connection-${crypto.randomUUID()}`, label: String(body.label ?? "Nova conexão"), base_url: String(body.baseUrl ?? "https://uazapi.exemplo.test"), status: "credentials_saved", meta_mode: "observation", webhook_installed_at: null, last_tested_at: null, last_error_code: null, last_error_summary: null, suspended_at: null };
      state.connections.unshift(connection);
      addAudit(GLOW_ID, { action: "uazapi.connection.created", targetType: "conexão", targetLabel: connection.label, detail: "Nova conexão UAZAPI cadastrada; credencial fictícia não persistida." });
      return { data: { id: connection.id } } as T;
    }
    const connectionMatch = url.pathname.match(/^\/api\/connections\/([^/]+)(?:\/(test|webhook|suspension|activation))?$/);
    if (connectionMatch) {
      const connection = state.connections.find((item) => item.id === connectionMatch[1]);
      if (!connection) mockError("connection_not_found", 404);
      const operation = connectionMatch[2] ?? "update";
      if (operation === "update" && method === "PATCH") {
        connection.label = String(body.label ?? connection.label); connection.base_url = String(body.baseUrl ?? connection.base_url);
        connection.status = connection.suspended_at ? "suspended" : "credentials_saved"; connection.last_tested_at = null; connection.last_error_code = null; connection.last_error_summary = null;
        addAudit(GLOW_ID, { action: "uazapi.connection.updated", targetType: "conexão", targetLabel: connection.label, detail: "Conexão atualizada; token vazio preserva credencial." });
        return { data: { id: connection.id, label: connection.label, status: connection.status } } as T;
      }
      if (operation === "test" && method === "POST") {
        connection.last_tested_at = now();
        if (connection.suspended_at) { connection.status = "suspended"; connection.last_error_code = null; connection.last_error_summary = null; }
        else { connection.status = "needs_attention"; connection.last_error_code = "uazapi_http_504"; connection.last_error_summary = "A UAZAPI excedeu o tempo de resposta (HTTP 504). Tente novamente."; }
        addAudit(GLOW_ID, { action: connection.last_error_code ? "uazapi.connection.test_failed" : "uazapi.connection.tested", targetType: "conexão", targetLabel: connection.label, detail: connection.last_error_code ? "uazapi_http_504 · timeout · HTTP 504\nA UAZAPI excedeu o tempo de resposta (HTTP 504).\nDetalhe: Gateway Timeout (fixture sintética)." : "Conexão confirmada." });
        if (connection.last_error_code) { const error = new Error("uazapi_connection_failed"); Object.assign(error, { payload: { error: "uazapi_connection_failed", diagnostic: { code: connection.last_error_code, category: "timeout", httpStatus: 504, summary: connection.last_error_summary } } }); throw error; }
        return { data: { connected: true, status: 200 } } as T;
      }
      if (operation === "suspension" && method === "PATCH") {
        if (body.suspended === true) { connection.suspended_at = now(); connection.status = "suspended"; connection.meta_mode = "observation"; }
        else { if (!connection.suspended_at || !connection.last_tested_at || Date.parse(connection.last_tested_at) <= Date.parse(connection.suspended_at) || connection.last_error_code) mockError("connection_test_required", 409); connection.suspended_at = null; connection.status = connection.webhook_installed_at ? "observing" : "needs_webhook"; connection.meta_mode = "observation"; }
        addAudit(GLOW_ID, { action: connection.suspended_at ? "uazapi.connection.suspended" : "uazapi.connection.resumed", targetType: "conexão", targetLabel: connection.label, detail: connection.suspended_at ? "Conexão suspensa de forma reversível; histórico preservado." : "Conexão retomada em modo observação após teste bem-sucedido." });
        return { data: { suspended: Boolean(connection.suspended_at) } } as T;
      }
      if ((operation === "webhook" || operation === "activation") && connection.status === "suspended") mockError("connection_suspended", 409);
      if (operation === "webhook" && method === "POST") {
        connection.webhook_installed_at = now();
        connection.status = "observing";
        connection.last_error_code = null;
        connection.last_error_summary = null;
        addAudit(GLOW_ID, { action: "uazapi.webhook.verified", targetType: "conexão", targetLabel: connection.label, detail: "Configuração do webhook UAZAPI consultada e confirmada; nenhuma alteração foi enviada ao provedor." });
        return { data: { verified: true, checks: { destination: true, enabled: true, events: true, filters: true, staticUrl: true } } } as T;
      }
      if (operation === "activation" && method === "PATCH") { connection.meta_mode = body.active ? "active" : "observation"; return { data: { active: connection.meta_mode === "active" } } as T; }
    }
    if (url.pathname === "/api/leads" && method === "GET") {
      return { data: [
        { id: "lead-demo-01", status: "active", first_seen_at: "2026-09-30T12:20:00.000Z", last_seen_at: "2026-09-30T14:10:00.000Z", last_classification: "paid_complete", attributions: [{ source_id: "ad-demo-01", headline: "Campanha GlowDC" }], conversion_events: [{ status: "observed", event_id: "demo-event-01" }] },
        { id: "lead-demo-02", status: "active", first_seen_at: "2026-09-30T10:35:00.000Z", last_seen_at: "2026-09-30T10:35:00.000Z", last_classification: "organic", attributions: [], conversion_events: [] }
      ] } as T;
    }
    if (url.pathname === "/api/operations" && method === "GET") {
      return { data: [
        { id: "operation-demo-01", event_id: "demo-event-01", status: "observed", occurred_at: "2026-09-30T14:10:00.000Z", sent_at: null, last_error_code: null },
        { id: "operation-demo-02", event_id: "demo-event-02", status: "sent", occurred_at: "2026-09-30T09:15:00.000Z", sent_at: "2026-09-30T09:15:04.000Z", last_error_code: null }
      ] } as T;
    }

    if (url.pathname === "/api/agendor-integrations" && method === "GET") {
      return { data: [{ id: "agendor-demo", label: "Agendor GlowDC", base_url: "https://api.agendor.com.br/v3", mode: "observation", status: "connected", last_tested_at: "2026-10-01T12:00:00.000Z", last_error_code: null }] } as T;
    }
    if (url.pathname === "/api/agendor-integrations" && method === "POST") {
      return { data: { id: "agendor-demo", label: String(body.label ?? "Agendor GlowDC"), base_url: "https://api.agendor.com.br/v3", mode: "observation", status: "credentials_saved", last_tested_at: null, last_error_code: null } } as T;
    }
    const agendorMatch = url.pathname.match(/^\/api\/agendor-integrations\/([^/]+)\/(test|catalog)$/);
    if (agendorMatch && method === "POST" && agendorMatch[2] === "test") {
      return { data: { connected: true, status: 200, account: { id: "account-demo", name: "Conta Agendor (demo)" } } } as T;
    }
    if (agendorMatch && method === "GET" && agendorMatch[2] === "catalog") {
      return { data: { me: { id: "user-demo", name: "Operação demo" }, funnels: [{ id: "funnel-demo", name: "Funil de teste" }], dealStages: [{ id: "stage-demo", name: "Contato" }], dealStatuses: [{ id: 1, name: "Em andamento" }], leadOrigins: [], dealCustomFields: [], requestIds: ["req-demo"] } } as T;
    }

    mockError("mock_route_not_found", 404);
  };
}

export const localMockApi = createMockApi();
