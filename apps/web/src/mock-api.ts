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

type MockState = {
  workspaces: MockWorkspace[];
  members: Record<string, MockMember[]>;
  audits: Record<string, MockAudit[]>;
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
      return { data: state.workspaces } as T;
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
      return { data: [{ id: "connection-demo", label: "WhatsApp comercial", base_url: "https://glowdc.exemplo.test", status: "active", meta_mode: "observation", webhook_installed_at: "2026-09-29T16:05:00.000Z", last_tested_at: "2026-09-30T13:42:00.000Z" }] } as T;
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

    mockError("mock_route_not_found", 404);
  };
}

export const localMockApi = createMockApi();
