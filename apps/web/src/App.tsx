import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, friendlyError, supabase } from "./lib";
import { AdminHub } from "./AdminHub";
import { AccountView, type AccountSummary } from "./AccountView";
import { isLocalMockMode, LOCAL_MOCK_EMAIL } from "./mock-api";
import { nextTheme, resolveTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

type Tab = "workspaces" | "visao" | "conectar" | "agendor" | "leads" | "operacao" | "admin" | "account";
type IconName = "workspace" | "overview" | "plug" | "leads" | "activity" | "admin" | "account" | "sun" | "moon" | "logout" | "eye" | "eyeOff" | "check" | "empty" | "chevron" | "more";
type Workspace = { id: string; name: string; slug: string };
type Membership = { role: string; workspaces: Workspace };
type WorkspaceOption = Workspace & { role: string | null; readOnly: boolean };
type Connection = {
  id: string;
  label: string;
  base_url: string;
  webhook_url: string;
  status: string;
  meta_mode: "observation" | "active";
  webhook_installed_at: string | null;
  last_tested_at: string | null;
  last_error_code?: string | null;
  last_error_summary?: string | null;
  suspended_at?: string | null;
};
type Lead = {
  id: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  last_classification: string;
  attributions: Array<{ source_id: string | null; headline: string | null }>;
  conversion_events: Array<{ status: string; event_id: string }>;
};
type Operation = {
  id: string;
  event_id: string;
  status: string;
  occurred_at: string;
  sent_at: string | null;
  last_error_code: string | null;
};
type AgendorIntegration = {
  id: string;
  label: string;
  base_url: string;
  mode: "observation" | "active";
  status: string;
  last_tested_at: string | null;
  last_error_code: string | null;
};

const assetPath = (file: string) => `${import.meta.env.BASE_URL}${file}`;

function initialTheme(): Theme {
  return resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY), window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function App() {
  const mockMode = isLocalMockMode();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!mockMode);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#090a0c" : "#f4f3f1");
  }, [theme]);

  useEffect(() => {
    if (mockMode) { setLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [mockMode]);

  useEffect(() => {
    if (loading) return;
    const target = mockMode || session ? "/glowdc/dashboard" : "/glowdc/login";
    if (window.location.pathname !== target) window.history.replaceState(null, "", `${target}${mockMode ? "?mock-admin=1" : ""}`);
  }, [loading, mockMode, session]);

  const toggleTheme = () => setTheme((current) => nextTheme(current));

  if (loading) return <LoadingScreen />;
  if (mockMode) return <Dashboard userEmail={LOCAL_MOCK_EMAIL} onSignOut={() => { window.location.href = "/glowdc/login"; }} theme={theme} toggleTheme={toggleTheme} mockMode />;
  if (!session) return <Login theme={theme} toggleTheme={toggleTheme} />;
  return <Dashboard userEmail={session.user.email ?? "Usuário"} onSignOut={() => void supabase.auth.signOut()} theme={theme} toggleTheme={toggleTheme} />;
}

function Login({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(friendlyError(authError));
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <header className="login-topbar"><Brand /><ThemeToggle theme={theme} onToggle={toggleTheme} /></header>
      <section className="login-frame" aria-label="Acesso ao Maxio Hub">
        <div className="login-context">
          <div className="brand-canvas"><img src={assetPath("maxio-hub-brand.png")} alt="m.hub" /></div>
          <div className="login-message">
            <p className="eyebrow">Telemetria de conversões</p>
            <h1>O sinal comercial,<br />de ponta a ponta.</h1>
            <p>Uma visão operacional de entradas do WhatsApp, atribuição de anúncios e entrega à Meta.</p>
          </div>
          <ol className="signal-route" aria-label="Fluxo acompanhado">
            <li><span>01</span>WhatsApp</li><li><span>02</span>Atribuição</li><li><span>03</span>Meta</li>
          </ol>
        </div>
        <div className="login-access">
          <form className="login-form" onSubmit={submit}>
            <div className="form-heading"><p className="eyebrow">Acesso interno</p><h2>Entrar no workspace</h2><p className="muted">Acesso por convite para a equipe da MAXIO COMUNICAÇÃO.</p></div>
            <Field label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="nome@empresa.com.br" />
            <div className="field"><label htmlFor="login-password">Senha</label><span className="input-with-action"><input id="login-password" required type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} /><button type="button" className="field-action" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword((current) => !current)}><Icon name={showPassword ? "eyeOff" : "eye"} /></button></span></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="button primary wide" disabled={busy}>{busy ? "Verificando…" : "Entrar no Maxio Hub"}</button>
            <p className="access-note"><span className="status-dot" /> Ambiente restrito e monitorado</p>
          </form>
        </div>
      </section>
      <footer className="login-footer"><span>MAXIO COMUNICAÇÃO</span><span>GlowDC · operação conectada</span></footer>
    </main>
  );
}

function Dashboard({ userEmail, onSignOut, theme, toggleTheme, mockMode = false }: { userEmail: string; onSignOut: () => void; theme: Theme; toggleTheme: () => void; mockMode?: boolean }) {
  const [tab, setTab] = useState<Tab>("workspaces");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [identity, setIdentity] = useState<AccountSummary>({ userId: "", name: "Equipe MAXIO", email: userEmail, photoUrl: null });
  const mobileNavRef = useRef<HTMLElement>(null);
  const workspaceRequest = useRef(0);

  const workspace = useMemo(() => workspaceOptions.find((item) => item.id === workspaceId), [workspaceOptions, workspaceId]);

  async function loadWorkspaces(showLoading = false) {
    if (showLoading) setBusy(true);
    setDirectoryError("");
    try {
      const [membershipResponse, contextResponse] = await Promise.all([
        api<{ data: Membership[] }>("/api/workspaces"),
        api<{ data: { platformAdmin: boolean; canAccessAdmin: boolean } }>("/api/admin/context")
      ]);
      const membershipsData = membershipResponse.data;
      const isPlatformAdmin = contextResponse.data.platformAdmin;
      const options: WorkspaceOption[] = isPlatformAdmin
        ? (await api<{ data: Array<Workspace & { canEdit?: boolean }> }>("/api/admin/workspaces")).data.map((item) => {
            const membership = membershipsData.find((entry) => entry.workspaces.id === item.id);
            return { id: item.id, name: item.name, slug: item.slug, role: membership?.role ?? null, readOnly: !membership || membership.role === "viewer" };
          })
        : membershipsData.map((item) => ({ ...item.workspaces, role: item.role, readOnly: item.role === "viewer" }));
      setMemberships(membershipsData);
      setWorkspaceOptions(options);
      setPlatformAdmin(isPlatformAdmin);
      setCanAccessAdmin(contextResponse.data.canAccessAdmin);
      setWorkspaceId((current) => current && options.some((item) => item.id === current) ? current : "");
    } catch (nextError) {
      setDirectoryError(friendlyError(nextError));
      setWorkspaceOptions([]);
      setMemberships([]);
    }
    finally { if (showLoading) setBusy(false); }
  }

  async function loadWorkspaceData(id: string) {
    const request = ++workspaceRequest.current;
    if (!id) { setConnections([]); setLeads([]); setOperations([]); return; }
    setConnections([]); setLeads([]); setOperations([]); setError("");
    try {
      const [connectionResponse, leadResponse, operationResponse] = await Promise.all([
        api<{ data: Connection[] }>(`/api/connections?workspaceId=${encodeURIComponent(id)}`),
        api<{ data: Lead[] }>(`/api/leads?workspaceId=${encodeURIComponent(id)}`),
        api<{ data: Operation[] }>(`/api/operations?workspaceId=${encodeURIComponent(id)}`)
      ]);
      if (request !== workspaceRequest.current) return;
      setConnections(connectionResponse.data);
      setLeads(leadResponse.data);
      setOperations(operationResponse.data);
    } catch (nextError) { if (request === workspaceRequest.current) setError(friendlyError(nextError)); }
  }

  useEffect(() => { void loadWorkspaces(true); }, []);
  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!mobileNavRef.current?.contains(event.target as Node)) setMobileMoreOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMoreOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [mobileMoreOpen]);
  useEffect(() => { void loadWorkspaceData(workspaceId); }, [workspaceId]);
  useEffect(() => {
    if (!mockMode) return;
    void api<{ data: AccountSummary }>("/api/account").then((response) => setIdentity(response.data));
  }, [mockMode]);

  if (busy) return <LoadingScreen />;
  if (directoryError) return <WorkspaceLoadFailure error={directoryError} onRetry={() => void loadWorkspaces(true)} onSignOut={onSignOut} />;
  if (memberships.length === 0 && !platformAdmin && !canAccessAdmin) return <WorkspacePending onSignOut={onSignOut} />;

  const activeCount = connections.filter((item) => item.status === "active").length;
  const sentCount = operations.filter((item) => item.status === "sent").length;
  const observedCount = operations.filter((item) => item.status === "observed").length;
  const healthy = connections.length > 0 && activeCount === connections.length;
  const readOnlyWorkspace = Boolean(workspace?.readOnly);
  const selectWorkspace = (id: string) => {
    setWorkspaceId(id);
    setTab("visao");
    setMobileMoreOpen(false);
  };
  const navigate = (nextTab: Tab) => { setTab(nextTab); setMobileMoreOpen(false); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand compact />
        <nav aria-label="Navegação principal" ref={mobileNavRef} className={workspaceId && tab !== "workspaces" ? "is-operational" : "is-home"}>
          <NavGroup label="Ambientes"><NavButton active={tab === "workspaces"} onClick={() => navigate("workspaces")} icon="workspace">Workspaces</NavButton></NavGroup>
          {workspaceId && tab !== "workspaces" && <NavGroup label="Operação"><NavButton active={tab === "visao"} onClick={() => navigate("visao")} icon="overview">Visão geral</NavButton><NavButton active={tab === "leads"} onClick={() => navigate("leads")} icon="leads">Leads</NavButton><NavButton active={tab === "operacao"} onClick={() => navigate("operacao")} icon="activity">Operação</NavButton></NavGroup>}
          {workspaceId && tab !== "workspaces" && !readOnlyWorkspace && <NavGroup label="Configuração" className="nav-config"><NavButton active={tab === "conectar"} onClick={() => navigate("conectar")} icon="plug">Conectar</NavButton><NavButton active={tab === "agendor"} onClick={() => navigate("agendor")} icon="plug">Agendor</NavButton></NavGroup>}
          {workspaceId && tab !== "workspaces" && <button type="button" className="mobile-more-trigger" aria-haspopup="menu" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((current) => !current)}><Icon name="more" /><span>Mais</span></button>}
          {mobileMoreOpen && <div className="mobile-more-menu" role="menu"><button role="menuitem" disabled={readOnlyWorkspace} onClick={() => navigate("conectar")}><Icon name="plug" />Conectar</button><button role="menuitem" disabled={readOnlyWorkspace} onClick={() => navigate("agendor")}><Icon name="plug" />Agendor</button>{readOnlyWorkspace && <p>Configuração disponível apenas para integrantes.</p>}</div>}
        </nav>
        <div className="sidebar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} expanded />
          <UserMenu identity={identity} canAccessAdmin={canAccessAdmin} activeTab={tab} onNavigate={setTab} onSignOut={onSignOut} expanded />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="workspace-identity"><p className="eyebrow">{tab === "workspaces" ? "MAXIO HUB" : "Workspace ativo"}</p><h2>{tab === "workspaces" ? "Workspaces" : workspace?.name ?? (tab === "admin" ? "Administração da plataforma" : "Acesso administrativo")}</h2></div>
          <div className="topbar-actions">
            {mockMode && <div className="demo-chip"><span />Dados de demonstração</div>}
            {tab !== "workspaces" && <div className={`health-chip ${healthy ? "healthy" : "attention"}`}><span />{healthy ? "Conexões íntegras" : "Verificar conexões"}</div>}
            {tab !== "workspaces" && workspaceOptions.length > 1 && <label className="workspace-select"><span className="sr-only">Workspace ativo</span><select value={workspaceId} onChange={(event) => selectWorkspace(event.target.value)} aria-label="Workspace ativo">{workspaceOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Icon name="chevron" /></label>}
            <div className="mobile-theme"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
            <div className="mobile-user"><UserMenu identity={identity} canAccessAdmin={canAccessAdmin} activeTab={tab} onNavigate={setTab} onSignOut={onSignOut} /></div>
          </div>
        </header>
        {error && <div className="global-notice"><Notice tone="error" dismiss={() => setError("")}>{error}</Notice></div>}
        {tab === "workspaces" && <WorkspacesHome workspaces={workspaceOptions} canAccessAdmin={canAccessAdmin} onSelect={selectWorkspace} onAdmin={() => navigate("admin")} />}
        {tab === "visao" && <Overview connections={connections} leads={leads} operations={operations} activeCount={activeCount} sentCount={sentCount} observedCount={observedCount} goConnect={readOnlyWorkspace ? undefined : () => navigate("conectar")} readOnly={readOnlyWorkspace} />}
        {tab === "conectar" && <Onboarding workspaceId={workspaceId} connections={connections} refresh={() => loadWorkspaceData(workspaceId)} />}
        {tab === "agendor" && <AgendorPanel workspaceId={workspaceId} />}
        {tab === "leads" && <LeadsView leads={leads} />}
        {tab === "operacao" && <OperationsView operations={operations} />}
        {tab === "admin" && <AdminHub workspaceId={workspaceId} onWorkspacesChanged={loadWorkspaces} />}
        {tab === "account" && <AccountView onChanged={setIdentity} />}
      </main>
    </div>
  );
}

function WorkspacePending({ onSignOut }: { onSignOut: () => void }) {
  return <main className="setup-shell"><section className="setup-card"><Brand /><div><p className="eyebrow">Acesso ao workspace</p><h1>Seu acesso está pendente</h1><p className="muted">Esta conta ainda não está associada a um workspace. Peça a um administrador para enviar um convite; o acesso será liberado após a confirmação.</p></div><button type="button" className="button secondary" onClick={onSignOut}>Sair da conta</button></section></main>;
}

function WorkspacesHome({ workspaces, canAccessAdmin, onSelect, onAdmin }: { workspaces: WorkspaceOption[]; canAccessAdmin: boolean; onSelect: (id: string) => void; onAdmin: () => void }) {
  return <div className="page workspace-home">
    <section className="workspace-home-hero" aria-labelledby="workspace-home-title">
      <div className="workspace-home-copy"><p className="eyebrow">Ambientes da MAXIO</p><h1 id="workspace-home-title">Qual workspace<br />vamos abrir?</h1><p>Escolha o ambiente para acompanhar entradas, atribuição e andamento comercial.</p></div>
      <div className="signal-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="workspace-count"><strong>{String(workspaces.length).padStart(2, "0")}</strong><span>{workspaces.length === 1 ? "workspace disponível" : "workspaces disponíveis"}</span></p>
    </section>
    {workspaces.length > 0 ? <section className="workspace-cards" aria-label="Workspaces disponíveis">{workspaces.map((item) => <button type="button" className="workspace-card" key={item.id} onClick={() => onSelect(item.id)}>
      <span className="workspace-card-top"><code>{item.slug}</code>{item.readOnly && <span className="read-only-tag">Somente leitura</span>}</span>
      <strong>{item.name}</strong>
      <span className="workspace-card-bottom"><span>{item.role === null ? "Acesso administrativo" : item.role ? `Seu papel · ${roleLabel(item.role)}` : "Ambiente de trabalho"}</span><span className="workspace-card-action">Abrir <b aria-hidden="true">↗</b></span></span>
    </button>)}</section> : <section className="workspace-empty"><span className="empty-signal" aria-hidden="true"><Icon name="workspace" /></span><div><strong>Nenhum workspace disponível ainda</strong><p>{canAccessAdmin ? "Crie o primeiro ambiente em Administração para começar." : "Peça à equipe MAXIO para associar sua conta a um workspace."}</p></div>{canAccessAdmin && <button type="button" className="button secondary" onClick={onAdmin}>Abrir Administração</button>}</section>}
    <footer className="workspace-home-foot"><span className="signal-line" /> Acesso restrito aos ambientes autorizados para sua conta.</footer>
  </div>;
}

function roleLabel(role: string): string {
  return ({ owner: "Owner", admin: "Admin", operator: "Operação", viewer: "Leitura" } as Record<string, string>)[role] ?? "Integrante";
}

function WorkspaceLoadFailure({ error, onRetry, onSignOut }: { error: string; onRetry: () => void; onSignOut: () => void }) {
  return <main className="setup-shell"><section className="setup-card"><Brand /><div><p className="eyebrow">Workspaces</p><h1>Não foi possível carregar seus ambientes</h1><p className="muted">{error}</p></div><div className="action-row"><button type="button" className="button primary" onClick={onRetry}>Tentar novamente</button><button type="button" className="button secondary" onClick={onSignOut}>Sair da conta</button></div></section></main>;
}

function Overview(props: { connections: Connection[]; leads: Lead[]; operations: Operation[]; activeCount: number; sentCount: number; observedCount: number; goConnect: (() => void) | undefined; readOnly?: boolean }) {
  return <div className="page"><PageTitle eyebrow="Visão geral" title="Pulso da operação" description="Entradas, atribuição e entrega num painel de acompanhamento. Conteúdo de conversa não é armazenado na base comercial." />{props.readOnly && <div className="read-only-caption"><span className="read-only-mark" />Consulta administrativa · somente leitura</div>}<section className="metrics" aria-label="Indicadores"><Metric label="Conexões ativas" value={props.activeCount} detail={`${props.connections.length} configuradas`} trend="origens" /><Metric label="Leads reconhecidos" value={props.leads.length} detail="janela atual" trend="base comercial" /><Metric label="Entregues à Meta" value={props.sentCount} detail={`${props.observedCount} em observação`} trend="conversões" /></section><section className="dashboard-grid"><div className="panel"><PanelHeading eyebrow="Infraestrutura" title="Estado das conexões" /><ConnectionRail connections={props.connections} emptyAction={props.goConnect} /></div><div className="panel governance-panel"><PanelHeading eyebrow="Governança" title="Dados sob controle" /><ul className="assurances"><li><span>7 dias</span><div><strong>Retenção curta</strong><small>payload sanitizado e cifrado</small></div></li><li><span>60 dias</span><div><strong>Trilha técnica</strong><small>auditoria de entrega</small></div></li><li><span>0 texto</span><div><strong>Privacidade</strong><small>conteúdo de conversa no Supabase</small></div></li></ul></div></section></div>;
}

function Onboarding({ workspaceId, connections, refresh }: { workspaceId: string; connections: Connection[]; refresh: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [datasetId, setDatasetId] = useState("");
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const selected = connections.find((item) => item.id === connectionId);

  useEffect(() => { if (!connectionId && connections[0]) setConnectionId(connections[0].id); }, [connectionId, connections]);
  useEffect(() => { setLabel(selected?.label ?? ""); setBaseUrl(selected?.base_url ?? ""); setToken(""); }, [connectionId]);

  async function act(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (nextError) {
      const checks = (nextError as { payload?: { verification?: { checks?: Record<string, boolean> } } })?.payload?.verification?.checks;
      if (checks) {
        const problems = [
          !checks.destination && "a URL exibida abaixo",
          !checks.enabled && "webhook habilitado",
          !checks.events && "eventos messages e connection",
          !checks.filters && "filtros fromMeYes e isGroupYes",
          !checks.staticUrl && "addUrlEvents e addUrlTypesMessages desativados"
        ].filter(Boolean);
        setError(`Webhook não confirmado. Confira na UAZAPI: ${problems.join("; ")}.`);
      } else {
        setError(friendlyError(nextError));
      }
    } finally {
      await refresh();
      setBusyAction("");
    }
  }

  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    await act("save", async () => {
      const editing = Boolean(selected);
      const response = await api<{ data: { id: string } }>(
        editing ? `/api/connections/${selected!.id}` : "/api/connections",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? { label, baseUrl, ...(token ? { token } : {}) } : { workspaceId, label, baseUrl, token }) }
      );
      setConnectionId(response.data.id);
      setToken("");
      setNotice(editing ? "Conexão atualizada. Token vazio preserva a credencial salva." : "Credenciais salvas e cifradas.");
    });
  }

  async function copyWebhookUrl() {
    if (!selected?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(selected.webhook_url);
      setError("");
      setNotice("URL copiada. Cole na UAZAPI, salve e depois verifique aqui.");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie a URL exibida.");
    }
  }

  async function verifyWebhook() {
    if (!selected) return;
    await act("webhook", async () => {
      await api(`/api/connections/${selected.id}/webhook`, { method: "POST" });
      setNotice("Configuração conferida na UAZAPI. Nenhuma alteração foi enviada ao provedor.");
    });
  }

  const canResume = Boolean(selected?.status === "suspended" && selected.suspended_at && selected.last_tested_at && Date.parse(selected.last_tested_at) > Date.parse(selected.suspended_at) && !selected.last_error_code);

  return (
    <div className="page">
      <PageTitle eyebrow="Configuração" title="Conectar uma origem" description="Avance com controle: credenciais, teste e webhook primeiro; entrega à Meta somente após observação." />
      <div className="onboarding-grid">
        <section className="steps" aria-label="Etapas">
          <Step number="1" title="Credenciais UAZAPI" state={selected ? "done" : "current"} />
          <Step number="2" title="Teste de conexão" state={selected?.last_tested_at ? "done" : selected ? "current" : "waiting"} />
          <Step number="3" title="Webhook de entrada" state={selected?.webhook_installed_at ? "done" : selected ? "current" : "waiting"} />
          <Step number="4" title="Destino Meta" state="current" />
          <Step number="5" title="Ativação" state={selected?.meta_mode === "active" ? "done" : "waiting"} />
        </section>
        <section className="panel form-panel">
          {connections.length > 0 && <label className="select-label"><span>Conexão em edição</span><select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}><option value="">Nova conexão</option>{connections.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}
          <PanelHeading eyebrow="01 · Origem" title="Instância UAZAPI" />
          <form onSubmit={saveConnection} className="form-grid">
            <Field label="Nome da conexão" value={label} onChange={setLabel} placeholder="WhatsApp comercial" />
            <Field label="URL da instância" value={baseUrl} onChange={setBaseUrl} placeholder="https://cliente.uazapi.com" />
            <Field label="Token da instância" type="password" value={token} onChange={setToken} placeholder={selected ? "Vazio mantém o token atual" : "Token da instância"} required={!selected} />
            <button className="button secondary" disabled={busyAction === "save"}>{busyAction === "save" ? "Salvando…" : selected ? "Salvar alterações" : "Salvar credenciais"}</button>
          </form>
          {selected?.last_error_code && !selected.last_error_code.startsWith("uazapi_webhook_") && <div className="notice error connection-diagnostic" role="alert"><strong>{selected.last_error_code}</strong><span>{selected.last_error_summary ?? "A conexão requer atenção. Consulte Administração → logs para o detalhe técnico sanitizado."}</span></div>}
          {selected && <div className="webhook-address">
            <div><span className="eyebrow">Endereço para a UAZAPI</span><code>{selected.webhook_url}</code><small>Use esta URL na instância. Depois de salvar lá, volte e confira a configuração.</small></div>
            <button className="button secondary" type="button" disabled={!selected.webhook_url} onClick={() => void copyWebhookUrl()}>Copiar URL</button>
          </div>}
          {selected && <div className="action-row">
            <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void act("test", async () => { await api(`/api/connections/${selected.id}/test`, { method: "POST" }); setNotice("Conexão confirmada."); })}>Testar conexão</button>
            <button className="button secondary" disabled={Boolean(busyAction) || selected.status === "suspended"} onClick={() => void verifyWebhook()}>{busyAction === "webhook" ? "Verificando…" : "Verificar webhook salvo"}</button>
            <button className="button secondary" disabled={Boolean(busyAction) || (selected.status === "suspended" && !canResume)} onClick={() => void act("suspension", async () => { const suspended = selected.status !== "suspended"; await api(`/api/connections/${selected.id}/suspension`, { method: "PATCH", body: JSON.stringify({ suspended }) }); setNotice(suspended ? "Conexão suspensa sem apagar o histórico." : "Conexão retomada em modo observação."); })}>{selected.status === "suspended" ? canResume ? "Retomar em observação" : "Teste necessário para retomar" : "Suspender conexão"}</button>
          </div>}
          <div className="section-divider" />
          <PanelHeading eyebrow="02 · Destino" title="Meta CAPI" />
          <div className="form-grid">
            <Field label="Dataset ID" value={datasetId} onChange={setDatasetId} />
            <Field label="Page ID" value={pageId} onChange={setPageId} />
            <Field label="Access token" type="password" value={accessToken} onChange={setAccessToken} />
            <button className="button secondary" onClick={() => void act("meta", async () => { await api("/api/meta-destinations", { method: "POST", body: JSON.stringify({ workspaceId, datasetId, pageId, accessToken }) }); setAccessToken(""); setNotice("Destino Meta salvo. O envio continua em observação."); })}>Salvar destino</button>
          </div>
          {selected && <div className="activation"><div><span className="eyebrow">Estado de entrega</span><strong>Envio de conversões</strong><small>{selected.status === "suspended" ? "Suspenso" : selected.meta_mode === "active" ? "Ativo" : "Em observação"}</small></div><button className="button primary" disabled={selected.status === "suspended"} onClick={() => void act("activation", async () => { await api(`/api/connections/${selected.id}/activation`, { method: "PATCH", body: JSON.stringify({ active: selected.meta_mode !== "active" }) }); setNotice(selected.meta_mode === "active" ? "Envios pausados." : "Conexão ativada."); })}>{selected.meta_mode === "active" ? "Voltar à observação" : "Ativar envios"}</button></div>}
          {notice && <Notice tone="success">{notice}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </section>
      </div>
    </div>
  );
}

function AgendorPanel({ workspaceId }: { workspaceId: string }) {
  const [integrations, setIntegrations] = useState<AgendorIntegration[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.agendor.com.br/v3");
  const [token, setToken] = useState("");
  const [catalog, setCatalog] = useState<{ funnels: unknown[]; dealStages: unknown[]; dealCustomFields: unknown[]; leadOrigins: unknown[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const selected = integrations.find((item) => item.id === selectedId);

  async function load() {
    if (!workspaceId) return;
    try {
      const response = await api<{ data: AgendorIntegration[] }>(`/api/agendor-integrations?workspaceId=${encodeURIComponent(workspaceId)}`);
      setIntegrations(response.data);
      setSelectedId((current) => current || response.data[0]?.id || "");
    } catch (nextError) { setError(friendlyError(nextError)); }
  }
  useEffect(() => { void load(); }, [workspaceId]);
  async function act(name: string, action: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await action(); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setBusy(""); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await act("save", async () => {
      const response = await api<{ data: AgendorIntegration }>("/api/agendor-integrations", {
        method: "POST", body: JSON.stringify({ workspaceId, label, baseUrl, token })
      });
      setSelectedId(response.data.id); setToken(""); setNotice("Credencial Agendor salva e cifrada em modo observação.");
    });
  }
  return <div className="page"><PageTitle eyebrow="Configuração" title="Agendor" description="Conecte o CRM por workspace e descubra os catálogos antes de ativar qualquer escrita comercial." /><div className="onboarding-grid"><section className="steps" aria-label="Etapas Agendor"><Step number="1" title="Credencial cifrada" state={selected ? "done" : "current"} /><Step number="2" title="Teste de leitura" state={selected?.last_tested_at ? "done" : selected ? "current" : "waiting"} /><Step number="3" title="Catálogos do CRM" state={catalog ? "done" : selected ? "current" : "waiting"} /><Step number="4" title="Escrita comercial" state="waiting" /></section><section className="panel form-panel">{integrations.length > 0 && <label className="select-label"><span>Integração em edição</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setCatalog(null); }}>{integrations.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}<PanelHeading eyebrow="01 · Acesso" title="Conta Agendor" /><form onSubmit={save} className="form-grid"><Field label="Nome da integração" value={label} onChange={setLabel} placeholder="Agendor GlowDC" /><Field label="URL da API" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.agendor.com.br/v3" /><Field label="Token da API" type="password" value={token} onChange={setToken} placeholder="••••••••••••" /><button className="button secondary" disabled={busy === "save"}>{busy === "save" ? "Salvando…" : "Salvar credencial"}</button></form>{selected && <div className="action-row"><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void act("test", async () => { await api(`/api/agendor-integrations/${selected.id}/test`, { method: "POST" }); setNotice("Leitura da conta Agendor confirmada."); })}>Testar leitura</button><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void act("catalog", async () => { const response = await api<{ data: typeof catalog }>(`/api/agendor-integrations/${selected.id}/catalog`); setCatalog(response.data); setNotice("Catálogos carregados em modo somente leitura."); })}>Carregar catálogos</button></div>}{catalog && <div className="notice success" role="status"><span>Funis: {catalog.funnels.length} · Etapas: {catalog.dealStages.length} · Campos de negócio: {catalog.dealCustomFields.length} · Origens: {catalog.leadOrigins.length}</span></div>}{notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}</section></div></div>;
}

function LeadsView({ leads }: { leads: Lead[] }) { return <div className="page"><PageTitle eyebrow="Base comercial" title="Leads reconhecidos" description="Uma linha por contato, sem conteúdo de conversa." />{leads.length === 0 ? <Empty title="Nenhum lead recebido" body="Conecte uma instância e envie uma mensagem sintética para validar o percurso." /> : <div className="table-wrap"><table><thead><tr><th>Última entrada</th><th>Origem</th><th>Classificação</th><th>Conversão</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{formatDate(lead.last_seen_at)}</strong><small>{lead.id.slice(0, 8)}</small></td><td>{lead.attributions[0]?.headline ?? lead.attributions[0]?.source_id ?? "Orgânico"}</td><td><Status value={lead.last_classification} /></td><td><Status value={lead.conversion_events[0]?.status ?? "sem envio"} /></td></tr>)}</tbody></table></div>}</div>; }
function OperationsView({ operations }: { operations: Operation[] }) { return <div className="page"><PageTitle eyebrow="Trilho de eventos" title="Operação e entrega" description="Cada marco representa uma conversão deduplicada e seu estado mais recente." />{operations.length === 0 ? <Empty title="O trilho está vazio" body="Eventos pagos completos aparecerão aqui primeiro em observação." /> : <ol className="event-rail">{operations.map((item) => <li key={item.id}><span className={`rail-dot ${item.status}`} /><div className="event-time">{formatDate(item.occurred_at)}</div><div className="event-card"><div><strong>LeadSubmitted</strong><code>{item.event_id.slice(0, 14)}…</code></div><Status value={item.status} />{item.last_error_code && <small>{item.last_error_code}</small>}</div></li>)}</ol>}</div>; }
function ConnectionRail({ connections, emptyAction }: { connections: Connection[]; emptyAction: (() => void) | undefined }) { if (!connections.length) return <Empty title="Nenhuma origem conectada" body="Cadastre a primeira instância para começar em modo observação." {...(emptyAction ? { action: "Conectar origem", onAction: emptyAction } : {})} />; return <ol className="connection-rail">{connections.map((item) => <li key={item.id}><span className={`pulse ${item.status}`} /><div><strong>{item.label}</strong><small>{item.base_url.replace(/^https?:\/\//, "")}</small>{item.last_error_code && <small className="connection-diagnostic-caption"><strong>{item.last_error_code}</strong> · {item.last_error_summary ?? "Consulte Administração → logs."}</small>}</div><Status value={item.status} /></li>)}</ol>; }

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-icon"><img src={assetPath("maxio-favicon.svg")} alt="" /></span><span className="brand-type"><strong>m.hub</strong><small>MAXIO COMUNICAÇÃO</small></span></div>; }
function ThemeToggle({ theme, onToggle, expanded = false }: { theme: Theme; onToggle: () => void; expanded?: boolean }) { const nextLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"; return <button className={`theme-toggle ${expanded ? "expanded" : ""}`} type="button" aria-label={nextLabel} title={nextLabel} onClick={onToggle}><Icon name={theme === "dark" ? "sun" : "moon"} />{expanded && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}</button>; }
function NavGroup({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) { return <div className={`nav-group ${className}`}><p>{label}</p>{children}</div>; }
function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: IconName; children: string }) { return <button className={active ? "active" : ""} aria-label={children} title={children} aria-current={active ? "page" : undefined} onClick={onClick}><Icon name={icon} /><span>{children}</span></button>; }
function UserMenu({ identity, canAccessAdmin, activeTab, onNavigate, onSignOut, expanded = false }: { identity: AccountSummary; canAccessAdmin: boolean; activeTab: Tab; onNavigate: (tab: Tab) => void; onSignOut: () => void; expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  const navigate = (tab: Tab) => { onNavigate(tab); setOpen(false); };
  const initial = (identity.name || identity.email || "U").slice(0, 1).toUpperCase();
  return <div className={`user-menu ${expanded ? "expanded" : "compact"}`} ref={root}>
    <button type="button" className={`user-menu-trigger ${activeTab === "account" || activeTab === "admin" ? "active" : ""}`} aria-label="Abrir menu da conta" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="avatar">{identity.photoUrl ? <img src={identity.photoUrl} alt="" /> : initial}</span>
      {expanded && <span className="user-menu-copy"><strong>{identity.name}</strong><small>{identity.email}</small></span>}
      {expanded && <Icon name="chevron" />}
    </button>
    {open && <div className="user-popover" role="menu">
      <header><span className="avatar">{identity.photoUrl ? <img src={identity.photoUrl} alt="" /> : initial}</span><div><strong>{identity.name}</strong><small>{identity.email}</small></div></header>
      <div className="user-popover-actions">
        <button role="menuitem" onClick={() => navigate("account")}><Icon name="account" /><span><strong>Conta</strong><small>Perfil e segurança</small></span></button>
        {canAccessAdmin && <button role="menuitem" onClick={() => navigate("admin")}><Icon name="admin" /><span><strong>Administração</strong><small>Workspaces, equipe e logs</small></span></button>}
      </div>
      <button className="user-menu-signout" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}><Icon name="logout" />Sair</button>
    </div>}
  </div>;
}
function Metric({ label, value, detail, trend }: { label: string; value: number; detail: string; trend: string }) { return <article className="metric"><div><span>{label}</span><small>{trend}</small></div><strong>{String(value).padStart(2, "0")}</strong><p>{detail}</p></article>; }
function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <header className="panel-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></header>; }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <section className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><p>{description}</p></section>; }
function Step({ number, title, state }: { number: string; title: string; state: "done" | "current" | "waiting" }) { return <div className={`step ${state}`}><span>{state === "done" ? <Icon name="check" /> : number}</span><strong>{title}</strong></div>; }
function Status({ value }: { value: string }) { const labels: Record<string, string> = { active: "Ativo", observing: "Observação", sent: "Enviado", observed: "Observado", queued: "Na fila", retrying: "Nova tentativa", paid_complete: "Anúncio completo", paid_incomplete: "Anúncio incompleto", organic: "Orgânico", connected: "Conectado", credentials_saved: "Credenciais salvas", needs_webhook: "Requer webhook", needs_attention: "Requer atenção", suspended: "Suspensa", failed_terminal: "Falha final", "sem envio": "Sem envio" }; return <span className={`status ${value}`}><i />{labels[value] ?? value}</span>; }
function Notice({ tone, children, dismiss }: { tone: "error" | "success"; children: string; dismiss?: () => void }) { return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{children}</span>{dismiss && <button onClick={dismiss} aria-label="Fechar">×</button>}</div>; }
function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <div className="empty"><span><Icon name="empty" /></span><strong>{title}</strong><p>{body}</p>{action && onAction && <button className="button secondary" onClick={onAction}>{action}</button>}</div>; }
function Field({ label, value, onChange, type = "text", placeholder, autoComplete, required = true }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; required?: boolean }) { return <label className="field"><span>{label}</span><input required={required} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} /></label>; }
function LoadingScreen() { return <main className="loading"><Brand /><span className="loader" /><p>Alinhando sinais…</p></main>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    workspace: <><path d="M3 21V7l9-4 9 4v14" /><path d="M8 21v-5h8v5" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v4a6 6 0 0 1-12 0V8Z" /></>,
    leads: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    activity: <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />,
    admin: <><path d="M4 21V10l8-5 8 5v11" /><path d="M9 21v-6h6v6" /><path d="M3 21h18" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2 3.1" /><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    empty: <><path d="M4 14.5V20h16v-5.5" /><path d="M8 10l4-4 4 4" /><path d="M12 6v10" /></>,
    chevron: <polyline points="6 9 12 15 18 9" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
