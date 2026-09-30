import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, friendlyError, supabase } from "./lib";

type Tab = "visao" | "conectar" | "leads" | "operacao";
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

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <LoadingScreen />;
  if (!session) return <Login />;
  return <Dashboard session={session} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <section className="login-story">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow light">Central de atribuição</p>
          <h1>Do primeiro sinal<br />à conversão comprovada.</h1>
          <p>Entradas do WhatsApp, contexto do anúncio e entrega à Meta em um percurso auditável.</p>
        </div>
        <div className="signal-route" aria-hidden="true">
          <span>WhatsApp</span><i /><span>Atribuição</span><i /><span>Meta</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">Acesso interno</p>
          <h2>Entre na operação</h2>
          <p className="muted">O cadastro é feito por convite. Não há acesso público.</p>
          <Field label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="Senha" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <Notice tone="error">{error}</Notice>}
          <button className="button primary wide" disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>("visao");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const workspace = useMemo(
    () => memberships.find((item) => item.workspaces.id === workspaceId)?.workspaces,
    [memberships, workspaceId]
  );

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand compact />
        <nav aria-label="Principal">
          <NavButton active={tab === "visao"} onClick={() => setTab("visao")} glyph="⌁">Visão geral</NavButton>
          <NavButton active={tab === "conectar"} onClick={() => setTab("conectar")} glyph="＋">Conectar</NavButton>
          <NavButton active={tab === "leads"} onClick={() => setTab("leads")} glyph="◉">Leads</NavButton>
          <NavButton active={tab === "operacao"} onClick={() => setTab("operacao")} glyph="↗">Operação</NavButton>
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{(session.user.email ?? "U").slice(0, 1).toUpperCase()}</span>
          <div><strong>{session.user.email}</strong><small>Equipe interna</small></div>
          <button className="icon-button" aria-label="Sair" onClick={() => void supabase.auth.signOut()}>↪</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Workspace</p><h2>{workspace?.name}</h2></div>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Workspace ativo">
            {memberships.map((item) => <option key={item.workspaces.id} value={item.workspaces.id}>{item.workspaces.name}</option>)}
          </select>
        </header>
        {error && <Notice tone="error" dismiss={() => setError("")}>{error}</Notice>}

        {tab === "visao" && <Overview connections={connections} leads={leads} operations={operations} activeCount={activeCount} sentCount={sentCount} observedCount={observedCount} goConnect={() => setTab("conectar")} />}
        {tab === "conectar" && <Onboarding workspaceId={workspaceId} connections={connections} refresh={() => loadWorkspaceData(workspaceId)} />}
        {tab === "leads" && <LeadsView leads={leads} />}
        {tab === "operacao" && <OperationsView operations={operations} />}
      </main>
    </div>
  );
}

function WorkspaceSetup({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/workspaces", { method: "POST", body: JSON.stringify({ name, slug }) });
      await onCreated();
    } catch (nextError) { setError(friendlyError(nextError)); }
  }
  return <main className="setup-shell"><section className="setup-card"><Brand /><p className="eyebrow">Primeira configuração</p><h1>Crie a mesa de operação</h1><p className="muted">Um workspace separa conexões, leads, credenciais e conversões.</p><form onSubmit={submit}><Field label="Nome" value={name} onChange={setName} placeholder="GlowDC" /><Field label="Identificador" value={slug} onChange={setSlug} placeholder="glowdc" />{error && <Notice tone="error">{error}</Notice>}<button className="button primary">Criar workspace</button></form></section></main>;
}

function Overview(props: { connections: Connection[]; leads: Lead[]; operations: Operation[]; activeCount: number; sentCount: number; observedCount: number; goConnect: () => void }) {
  return <div className="page"><section className="page-lead"><div><p className="eyebrow">Hoje na mesa</p><h1>Sinais que viraram<br /><em>evidência comercial.</em></h1></div><p>O painel acompanha entradas e atribuição. Conteúdo de conversa não é armazenado na base comercial.</p></section><section className="metrics"><Metric label="Conexões ativas" value={props.activeCount} detail={`${props.connections.length} configuradas`} /><Metric label="Leads reconhecidos" value={props.leads.length} detail="janela atual" /><Metric label="Entregues à Meta" value={props.sentCount} detail={`${props.observedCount} em observação`} /></section><section className="split"><div className="panel"><PanelHeading eyebrow="Percurso" title="Estado das conexões" /><ConnectionRail connections={props.connections} emptyAction={props.goConnect} /></div><div className="panel quiet"><PanelHeading eyebrow="Princípio" title="Dados sob controle" /><ul className="assurances"><li><span>7 dias</span>payload sanitizado e cifrado</li><li><span>60 dias</span>auditoria técnica de entrega</li><li><span>0 texto</span>conteúdo de conversa no Supabase</li></ul></div></section></div>;
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

  useEffect(() => {
    if (!connectionId && connections[0]) setConnectionId(connections[0].id);
  }, [connectionId, connections]);

  async function act(name: string, action: () => Promise<void>) {
    setBusyAction(name); setError(""); setNotice("");
    try { await action(); await refresh(); }
    catch (nextError) {
      setError(friendlyError(nextError));
      const fallback = (nextError as { payload?: { fallback?: { webhookUrl: string; events: string[]; exclude: string[] } } }).payload?.fallback;
      if (fallback) {
        setError(`${friendlyError(nextError)} URL: ${fallback.webhookUrl}. Eventos: ${fallback.events.join(", ")}. Excluir: ${fallback.exclude.join(", ")}.`);
      }
    }
    finally { setBusyAction(""); }
  }
  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    await act("save", async () => {
      const response = await api<{ data: { id: string } }>("/api/connections", { method: "POST", body: JSON.stringify({ workspaceId, label, baseUrl, token }) });
      setConnectionId(response.data.id); setToken(""); setNotice("Credenciais salvas e cifradas.");
    });
  }
  return <div className="page"><section className="page-lead compact"><div><p className="eyebrow">Onboarding controlado</p><h1>Conecte a origem,<br /><em>observe antes de ativar.</em></h1></div><p>As etapas preservam o modo observação até você confirmar a entrega à Meta.</p></section><div className="onboarding-grid"><section className="steps" aria-label="Etapas"><Step number="1" title="Credenciais UAZAPI" state={selected ? "done" : "current"} /><Step number="2" title="Teste de conexão" state={selected?.last_tested_at ? "done" : selected ? "current" : "waiting"} /><Step number="3" title="Webhook de entrada" state={selected?.webhook_installed_at ? "done" : selected ? "current" : "waiting"} /><Step number="4" title="Destino Meta" state="current" /><Step number="5" title="Ativação" state={selected?.meta_mode === "active" ? "done" : "waiting"} /></section><section className="panel form-panel">{connections.length > 0 && <label className="select-label">Conexão em edição<select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>{connections.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}<PanelHeading eyebrow="01 · Origem" title="Instância UAZAPI" /><form onSubmit={saveConnection} className="form-grid"><Field label="Nome da conexão" value={label} onChange={setLabel} placeholder="WhatsApp comercial" /><Field label="URL da instância" value={baseUrl} onChange={setBaseUrl} placeholder="https://cliente.uazapi.com" /><Field label="Token da instância" type="password" value={token} onChange={setToken} placeholder="••••••••••••" /><button className="button secondary" disabled={busyAction === "save"}>{busyAction === "save" ? "Salvando…" : "Salvar credenciais"}</button></form>{selected && <div className="action-row"><button className="button secondary" onClick={() => void act("test", async () => { await api(`/api/connections/${selected.id}/test`, { method: "POST" }); setNotice("Conexão confirmada."); })}>Testar conexão</button><button className="button secondary" onClick={() => void act("webhook", async () => { await api(`/api/connections/${selected.id}/webhook`, { method: "POST" }); setNotice("Webhook instalado."); })}>Instalar webhook</button></div>}<hr /><PanelHeading eyebrow="02 · Destino" title="Meta CAPI" /><div className="form-grid"><Field label="Dataset ID" value={datasetId} onChange={setDatasetId} /><Field label="Page ID" value={pageId} onChange={setPageId} /><Field label="Access token" type="password" value={accessToken} onChange={setAccessToken} /><button className="button secondary" onClick={() => void act("meta", async () => { await api("/api/meta-destinations", { method: "POST", body: JSON.stringify({ workspaceId, datasetId, pageId, accessToken }) }); setAccessToken(""); setNotice("Destino Meta salvo. O envio continua em observação."); })}>Salvar destino</button></div>{selected && <div className="activation"><div><strong>Envio de conversões</strong><span>{selected.meta_mode === "active" ? "Ativo" : "Em observação"}</span></div><button className="button primary" onClick={() => void act("activation", async () => { await api(`/api/connections/${selected.id}/activation`, { method: "PATCH", body: JSON.stringify({ active: selected.meta_mode !== "active" }) }); setNotice(selected.meta_mode === "active" ? "Envios pausados." : "Conexão ativada."); })}>{selected.meta_mode === "active" ? "Voltar à observação" : "Ativar envios"}</button></div>}{notice && <Notice tone="success">{notice}</Notice>}{error && <Notice tone="error">{error}</Notice>}</section></div></div>;
}

function LeadsView({ leads }: { leads: Lead[] }) {
  return <div className="page"><PageTitle eyebrow="Base comercial" title="Leads reconhecidos" description="Uma linha por contato, sem conteúdo de conversa." />{leads.length === 0 ? <Empty title="Nenhum lead recebido" body="Conecte uma instância e envie uma mensagem sintética para validar o percurso." /> : <div className="table-wrap"><table><thead><tr><th>Última entrada</th><th>Origem</th><th>Classificação</th><th>Conversão</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{formatDate(lead.last_seen_at)}</strong><small>{lead.id.slice(0, 8)}</small></td><td>{lead.attributions[0]?.headline ?? lead.attributions[0]?.source_id ?? "Orgânico"}</td><td><Status value={lead.last_classification} /></td><td><Status value={lead.conversion_events[0]?.status ?? "sem envio"} /></td></tr>)}</tbody></table></div>}</div>;
}

function OperationsView({ operations }: { operations: Operation[] }) {
  return <div className="page"><PageTitle eyebrow="Trilho de eventos" title="Operação e entrega" description="Cada marco representa uma conversão deduplicada e seu estado mais recente." />{operations.length === 0 ? <Empty title="O trilho está vazio" body="Eventos pagos completos aparecerão aqui primeiro em observação." /> : <ol className="event-rail">{operations.map((item) => <li key={item.id}><span className={`rail-dot ${item.status}`} /><div className="event-time">{formatDate(item.occurred_at)}</div><div className="event-card"><div><strong>LeadSubmitted</strong><code>{item.event_id.slice(0, 14)}…</code></div><Status value={item.status} />{item.last_error_code && <small>{item.last_error_code}</small>}</div></li>)}</ol>}</div>;
}

function ConnectionRail({ connections, emptyAction }: { connections: Connection[]; emptyAction: () => void }) {
  if (!connections.length) return <Empty title="Nenhuma origem conectada" body="Cadastre a primeira instância para começar em modo observação." action="Conectar origem" onAction={emptyAction} />;
  return <ol className="connection-rail">{connections.map((item) => <li key={item.id}><span className={`pulse ${item.status}`} /><div><strong>{item.label}</strong><small>{item.base_url.replace(/^https?:\/\//, "")}</small></div><Status value={item.status} /></li>)}</ol>;
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-mark"><i /><i /><i /></span><span><strong>GlowDC</strong><small>Signal Desk</small></span></div>; }
function NavButton({ active, onClick, glyph, children }: { active: boolean; onClick: () => void; glyph: string; children: string }) { return <button className={active ? "active" : ""} onClick={onClick}><span>{glyph}</span>{children}</button>; }
function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <article className="metric"><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong><small>{detail}</small></article>; }
function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <header className="panel-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></header>; }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <section className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></section>; }
function Step({ number, title, state }: { number: string; title: string; state: "done" | "current" | "waiting" }) { return <div className={`step ${state}`}><span>{state === "done" ? "✓" : number}</span><strong>{title}</strong></div>; }
function Status({ value }: { value: string }) { const labels: Record<string, string> = { active: "Ativo", observing: "Observação", sent: "Enviado", observed: "Observado", queued: "Na fila", retrying: "Nova tentativa", paid_complete: "Anúncio completo", paid_incomplete: "Anúncio incompleto", organic: "Orgânico", connected: "Conectado", credentials_saved: "Credenciais salvas", needs_webhook: "Requer webhook", needs_attention: "Requer atenção", failed_terminal: "Falha final", "sem envio": "Sem envio" }; return <span className={`status ${value}`}>{labels[value] ?? value}</span>; }
function Notice({ tone, children, dismiss }: { tone: "error" | "success"; children: string; dismiss?: () => void }) { return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{children}</span>{dismiss && <button onClick={dismiss} aria-label="Fechar">×</button>}</div>; }
function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <div className="empty"><span>⌁</span><strong>{title}</strong><p>{body}</p>{action && onAction && <button className="button secondary" onClick={onAction}>{action}</button>}</div>; }
function Field({ label, value, onChange, type = "text", placeholder, autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string }) { return <label className="field"><span>{label}</span><input required type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} /></label>; }
function LoadingScreen() { return <main className="loading"><Brand /><span className="loader" /><p>Alinhando sinais…</p></main>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
