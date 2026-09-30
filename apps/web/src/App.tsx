import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, friendlyError, supabase } from "./lib";
import { nextTheme, resolveTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

type Tab = "visao" | "conectar" | "leads" | "operacao";
type IconName = "overview" | "plug" | "leads" | "activity" | "sun" | "moon" | "logout" | "eye" | "eyeOff" | "check" | "empty" | "chevron";
type Workspace = { id: string; name: string; slug: string };
type Membership = { role: string; workspaces: Workspace };
type Connection = {
  id: string;
  label: string;
  base_url: string;
  status: string;
  meta_mode: "observation" | "active";
  webhook_installed_at: string | null;
  last_tested_at: string | null;
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

const assetPath = (file: string) => `${import.meta.env.BASE_URL}${file}`;

function initialTheme(): Theme {
  return resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY), window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#090a0c" : "#f4f3f1");
  }, [theme]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const target = session ? "/glowdc/dashboard" : "/glowdc/login";
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [loading, session]);

  const toggleTheme = () => setTheme((current) => nextTheme(current));

  if (loading) return <LoadingScreen />;
  if (!session) return <Login theme={theme} toggleTheme={toggleTheme} />;
  return <Dashboard session={session} theme={theme} toggleTheme={toggleTheme} />;
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

function Dashboard({ session, theme, toggleTheme }: { session: Session; theme: Theme; toggleTheme: () => void }) {
  const [tab, setTab] = useState<Tab>("visao");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const workspace = useMemo(() => memberships.find((item) => item.workspaces.id === workspaceId)?.workspaces, [memberships, workspaceId]);

  async function loadWorkspaces() {
    try {
      const response = await api<{ data: Membership[] }>("/api/workspaces");
      setMemberships(response.data);
      setWorkspaceId((current) => current || response.data[0]?.workspaces.id || "");
    } catch (nextError) { setError(friendlyError(nextError)); }
    finally { setBusy(false); }
  }

  async function loadWorkspaceData(id: string) {
    if (!id) return;
    try {
      const [connectionResponse, leadResponse, operationResponse] = await Promise.all([
        api<{ data: Connection[] }>(`/api/connections?workspaceId=${encodeURIComponent(id)}`),
        api<{ data: Lead[] }>(`/api/leads?workspaceId=${encodeURIComponent(id)}`),
        api<{ data: Operation[] }>(`/api/operations?workspaceId=${encodeURIComponent(id)}`)
      ]);
      setConnections(connectionResponse.data);
      setLeads(leadResponse.data);
      setOperations(operationResponse.data);
    } catch (nextError) { setError(friendlyError(nextError)); }
  }

  useEffect(() => { void loadWorkspaces(); }, []);
  useEffect(() => { void loadWorkspaceData(workspaceId); }, [workspaceId]);

  if (busy) return <LoadingScreen />;
  if (memberships.length === 0) return <WorkspaceSetup onCreated={loadWorkspaces} />;

  const activeCount = connections.filter((item) => item.status === "active").length;
  const sentCount = operations.filter((item) => item.status === "sent").length;
  const observedCount = operations.filter((item) => item.status === "observed").length;
  const healthy = connections.length > 0 && activeCount === connections.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand compact />
        <nav aria-label="Navegação principal">
          <NavGroup label="Operação"><NavButton active={tab === "visao"} onClick={() => setTab("visao")} icon="overview">Visão geral</NavButton><NavButton active={tab === "leads"} onClick={() => setTab("leads")} icon="leads">Leads</NavButton><NavButton active={tab === "operacao"} onClick={() => setTab("operacao")} icon="activity">Operação</NavButton></NavGroup>
          <NavGroup label="Configuração"><NavButton active={tab === "conectar"} onClick={() => setTab("conectar")} icon="plug">Conectar</NavButton></NavGroup>
        </nav>
        <div className="sidebar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} expanded />
          <div className="sidebar-user"><span className="avatar">{(session.user.email ?? "U").slice(0, 1).toUpperCase()}</span><div><strong>{session.user.email}</strong><small>Equipe MAXIO</small></div><button className="icon-button" aria-label="Sair" title="Sair" onClick={() => void supabase.auth.signOut()}><Icon name="logout" /></button></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="workspace-identity"><p className="eyebrow">Workspace ativo</p><h2>{workspace?.name}</h2></div>
          <div className="topbar-actions">
            <div className={`health-chip ${healthy ? "healthy" : "attention"}`}><span />{healthy ? "Conexões íntegras" : "Verificar conexões"}</div>
            <label className="workspace-select"><span className="sr-only">Workspace ativo</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Workspace ativo">{memberships.map((item) => <option key={item.workspaces.id} value={item.workspaces.id}>{item.workspaces.name}</option>)}</select><Icon name="chevron" /></label>
            <div className="mobile-theme"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
          </div>
        </header>
        {error && <div className="global-notice"><Notice tone="error" dismiss={() => setError("")}>{error}</Notice></div>}
        {tab === "visao" && <Overview connections={connections} leads={leads} operations={operations} activeCount={activeCount} sentCount={sentCount} observedCount={observedCount} goConnect={() => setTab("conectar")} />}
        {tab === "conectar" && <Onboarding workspaceId={workspaceId} connections={connections} refresh={() => loadWorkspaceData(workspaceId)} />}
        {tab === "leads" && <LeadsView leads={leads} />}
        {tab === "operacao" && <OperationsView operations={operations} />}
      </main>
    </div>
  );
}

function WorkspaceSetup({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); try { await api("/api/workspaces", { method: "POST", body: JSON.stringify({ name, slug }) }); await onCreated(); } catch (nextError) { setError(friendlyError(nextError)); } }
  return <main className="setup-shell"><section className="setup-card"><Brand /><div><p className="eyebrow">Primeira configuração</p><h1>Crie a mesa de operação</h1><p className="muted">Um workspace separa conexões, leads, credenciais e conversões.</p></div><form onSubmit={submit}><Field label="Nome" value={name} onChange={setName} placeholder="GlowDC" /><Field label="Identificador" value={slug} onChange={setSlug} placeholder="glowdc" />{error && <Notice tone="error">{error}</Notice>}<button className="button primary">Criar workspace</button></form></section></main>;
}

function Overview(props: { connections: Connection[]; leads: Lead[]; operations: Operation[]; activeCount: number; sentCount: number; observedCount: number; goConnect: () => void }) {
  return <div className="page"><PageTitle eyebrow="Visão geral" title="Pulso da operação" description="Entradas, atribuição e entrega num painel de acompanhamento. Conteúdo de conversa não é armazenado na base comercial." /><section className="metrics" aria-label="Indicadores"><Metric label="Conexões ativas" value={props.activeCount} detail={`${props.connections.length} configuradas`} trend="origens" /><Metric label="Leads reconhecidos" value={props.leads.length} detail="janela atual" trend="base comercial" /><Metric label="Entregues à Meta" value={props.sentCount} detail={`${props.observedCount} em observação`} trend="conversões" /></section><section className="dashboard-grid"><div className="panel"><PanelHeading eyebrow="Infraestrutura" title="Estado das conexões" /><ConnectionRail connections={props.connections} emptyAction={props.goConnect} /></div><div className="panel governance-panel"><PanelHeading eyebrow="Governança" title="Dados sob controle" /><ul className="assurances"><li><span>7 dias</span><div><strong>Retenção curta</strong><small>payload sanitizado e cifrado</small></div></li><li><span>60 dias</span><div><strong>Trilha técnica</strong><small>auditoria de entrega</small></div></li><li><span>0 texto</span><div><strong>Privacidade</strong><small>conteúdo de conversa no Supabase</small></div></li></ul></div></section></div>;
}

function Onboarding({ workspaceId, connections, refresh }: { workspaceId: string; connections: Connection[]; refresh: () => Promise<void> }) {
  const [label, setLabel] = useState(""); const [baseUrl, setBaseUrl] = useState(""); const [token, setToken] = useState(""); const [connectionId, setConnectionId] = useState(connections[0]?.id ?? ""); const [datasetId, setDatasetId] = useState(""); const [pageId, setPageId] = useState(""); const [accessToken, setAccessToken] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busyAction, setBusyAction] = useState("");
  const selected = connections.find((item) => item.id === connectionId);
  useEffect(() => { if (!connectionId && connections[0]) setConnectionId(connections[0].id); }, [connectionId, connections]);
  async function act(name: string, action: () => Promise<void>) { setBusyAction(name); setError(""); setNotice(""); try { await action(); await refresh(); } catch (nextError) { setError(friendlyError(nextError)); const fallback = (nextError as { payload?: { fallback?: { webhookUrl: string; events: string[]; exclude: string[] } } }).payload?.fallback; if (fallback) setError(`${friendlyError(nextError)} URL: ${fallback.webhookUrl}. Eventos: ${fallback.events.join(", ")}. Excluir: ${fallback.exclude.join(", ")}.`); } finally { setBusyAction(""); } }
  async function saveConnection(event: FormEvent) { event.preventDefault(); await act("save", async () => { const response = await api<{ data: { id: string } }>("/api/connections", { method: "POST", body: JSON.stringify({ workspaceId, label, baseUrl, token }) }); setConnectionId(response.data.id); setToken(""); setNotice("Credenciais salvas e cifradas."); }); }
  return <div className="page"><PageTitle eyebrow="Configuração" title="Conectar uma origem" description="Avance com controle: credenciais, teste e webhook primeiro; entrega à Meta somente após observação." /><div className="onboarding-grid"><section className="steps" aria-label="Etapas"><Step number="1" title="Credenciais UAZAPI" state={selected ? "done" : "current"} /><Step number="2" title="Teste de conexão" state={selected?.last_tested_at ? "done" : selected ? "current" : "waiting"} /><Step number="3" title="Webhook de entrada" state={selected?.webhook_installed_at ? "done" : selected ? "current" : "waiting"} /><Step number="4" title="Destino Meta" state="current" /><Step number="5" title="Ativação" state={selected?.meta_mode === "active" ? "done" : "waiting"} /></section><section className="panel form-panel">{connections.length > 0 && <label className="select-label"><span>Conexão em edição</span><select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>{connections.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}<PanelHeading eyebrow="01 · Origem" title="Instância UAZAPI" /><form onSubmit={saveConnection} className="form-grid"><Field label="Nome da conexão" value={label} onChange={setLabel} placeholder="WhatsApp comercial" /><Field label="URL da instância" value={baseUrl} onChange={setBaseUrl} placeholder="https://cliente.uazapi.com" /><Field label="Token da instância" type="password" value={token} onChange={setToken} placeholder="••••••••••••" /><button className="button secondary" disabled={busyAction === "save"}>{busyAction === "save" ? "Salvando…" : "Salvar credenciais"}</button></form>{selected && <div className="action-row"><button className="button secondary" onClick={() => void act("test", async () => { await api(`/api/connections/${selected.id}/test`, { method: "POST" }); setNotice("Conexão confirmada."); })}>Testar conexão</button><button className="button secondary" onClick={() => void act("webhook", async () => { await api(`/api/connections/${selected.id}/webhook`, { method: "POST" }); setNotice("Webhook instalado."); })}>Instalar webhook</button></div>}<div className="section-divider" /><PanelHeading eyebrow="02 · Destino" title="Meta CAPI" /><div className="form-grid"><Field label="Dataset ID" value={datasetId} onChange={setDatasetId} /><Field label="Page ID" value={pageId} onChange={setPageId} /><Field label="Access token" type="password" value={accessToken} onChange={setAccessToken} /><button className="button secondary" onClick={() => void act("meta", async () => { await api("/api/meta-destinations", { method: "POST", body: JSON.stringify({ workspaceId, datasetId, pageId, accessToken }) }); setAccessToken(""); setNotice("Destino Meta salvo. O envio continua em observação."); })}>Salvar destino</button></div>{selected && <div className="activation"><div><span className="eyebrow">Estado de entrega</span><strong>Envio de conversões</strong><small>{selected.meta_mode === "active" ? "Ativo" : "Em observação"}</small></div><button className="button primary" onClick={() => void act("activation", async () => { await api(`/api/connections/${selected.id}/activation`, { method: "PATCH", body: JSON.stringify({ active: selected.meta_mode !== "active" }) }); setNotice(selected.meta_mode === "active" ? "Envios pausados." : "Conexão ativada."); })}>{selected.meta_mode === "active" ? "Voltar à observação" : "Ativar envios"}</button></div>}{notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}</section></div></div>;
}

function LeadsView({ leads }: { leads: Lead[] }) { return <div className="page"><PageTitle eyebrow="Base comercial" title="Leads reconhecidos" description="Uma linha por contato, sem conteúdo de conversa." />{leads.length === 0 ? <Empty title="Nenhum lead recebido" body="Conecte uma instância e envie uma mensagem sintética para validar o percurso." /> : <div className="table-wrap"><table><thead><tr><th>Última entrada</th><th>Origem</th><th>Classificação</th><th>Conversão</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{formatDate(lead.last_seen_at)}</strong><small>{lead.id.slice(0, 8)}</small></td><td>{lead.attributions[0]?.headline ?? lead.attributions[0]?.source_id ?? "Orgânico"}</td><td><Status value={lead.last_classification} /></td><td><Status value={lead.conversion_events[0]?.status ?? "sem envio"} /></td></tr>)}</tbody></table></div>}</div>; }
function OperationsView({ operations }: { operations: Operation[] }) { return <div className="page"><PageTitle eyebrow="Trilho de eventos" title="Operação e entrega" description="Cada marco representa uma conversão deduplicada e seu estado mais recente." />{operations.length === 0 ? <Empty title="O trilho está vazio" body="Eventos pagos completos aparecerão aqui primeiro em observação." /> : <ol className="event-rail">{operations.map((item) => <li key={item.id}><span className={`rail-dot ${item.status}`} /><div className="event-time">{formatDate(item.occurred_at)}</div><div className="event-card"><div><strong>LeadSubmitted</strong><code>{item.event_id.slice(0, 14)}…</code></div><Status value={item.status} />{item.last_error_code && <small>{item.last_error_code}</small>}</div></li>)}</ol>}</div>; }
function ConnectionRail({ connections, emptyAction }: { connections: Connection[]; emptyAction: () => void }) { if (!connections.length) return <Empty title="Nenhuma origem conectada" body="Cadastre a primeira instância para começar em modo observação." action="Conectar origem" onAction={emptyAction} />; return <ol className="connection-rail">{connections.map((item) => <li key={item.id}><span className={`pulse ${item.status}`} /><div><strong>{item.label}</strong><small>{item.base_url.replace(/^https?:\/\//, "")}</small></div><Status value={item.status} /></li>)}</ol>; }

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-icon"><img src={assetPath("maxio-favicon.svg")} alt="" /></span><span className="brand-type"><strong>m.hub</strong><small>MAXIO COMUNICAÇÃO</small></span></div>; }
function ThemeToggle({ theme, onToggle, expanded = false }: { theme: Theme; onToggle: () => void; expanded?: boolean }) { const nextLabel = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"; return <button className={`theme-toggle ${expanded ? "expanded" : ""}`} type="button" aria-label={nextLabel} title={nextLabel} onClick={onToggle}><Icon name={theme === "dark" ? "sun" : "moon"} />{expanded && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}</button>; }
function NavGroup({ label, children }: { label: string; children: ReactNode }) { return <div className="nav-group"><p>{label}</p>{children}</div>; }
function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: IconName; children: string }) { return <button className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={onClick}><Icon name={icon} /><span>{children}</span></button>; }
function Metric({ label, value, detail, trend }: { label: string; value: number; detail: string; trend: string }) { return <article className="metric"><div><span>{label}</span><small>{trend}</small></div><strong>{String(value).padStart(2, "0")}</strong><p>{detail}</p></article>; }
function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <header className="panel-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></header>; }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <section className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><p>{description}</p></section>; }
function Step({ number, title, state }: { number: string; title: string; state: "done" | "current" | "waiting" }) { return <div className={`step ${state}`}><span>{state === "done" ? <Icon name="check" /> : number}</span><strong>{title}</strong></div>; }
function Status({ value }: { value: string }) { const labels: Record<string, string> = { active: "Ativo", observing: "Observação", sent: "Enviado", observed: "Observado", queued: "Na fila", retrying: "Nova tentativa", paid_complete: "Anúncio completo", paid_incomplete: "Anúncio incompleto", organic: "Orgânico", connected: "Conectado", credentials_saved: "Credenciais salvas", needs_webhook: "Requer webhook", needs_attention: "Requer atenção", failed_terminal: "Falha final", "sem envio": "Sem envio" }; return <span className={`status ${value}`}><i />{labels[value] ?? value}</span>; }
function Notice({ tone, children, dismiss }: { tone: "error" | "success"; children: string; dismiss?: () => void }) { return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{children}</span>{dismiss && <button onClick={dismiss} aria-label="Fechar">×</button>}</div>; }
function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <div className="empty"><span><Icon name="empty" /></span><strong>{title}</strong><p>{body}</p>{action && onAction && <button className="button secondary" onClick={onAction}>{action}</button>}</div>; }
function Field({ label, value, onChange, type = "text", placeholder, autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string }) { return <label className="field"><span>{label}</span><input required type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} /></label>; }
function LoadingScreen() { return <main className="loading"><Brand /><span className="loader" /><p>Alinhando sinais…</p></main>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v4a6 6 0 0 1-12 0V8Z" /></>,
    leads: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    activity: <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2 3.1" /><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    empty: <><path d="M4 14.5V20h16v-5.5" /><path d="M8 10l4-4 4 4" /><path d="M12 6v10" /></>,
    chevron: <polyline points="6 9 12 15 18 9" />
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
