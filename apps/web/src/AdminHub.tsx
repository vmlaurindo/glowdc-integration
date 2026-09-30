import { useEffect, useState, type FormEvent } from "react";
import { api, friendlyError } from "./lib";

type AdminSection = "workspaces" | "team" | "audit";
type Role = "owner" | "admin" | "operator" | "viewer";

type AdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type Member = {
  userId: string;
  email: string;
  role: Role;
  status: "active" | "pending";
  createdAt: string;
};

type AuditEntry = {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetLabel: string;
  detail: string;
};

const roleLabels: Record<Role, string> = { owner: "Owner", admin: "Admin", operator: "Operador", viewer: "Leitura" };
const actionLabels: Record<string, string> = {
  "workspace.created": "Workspace criado",
  "workspace.updated": "Workspace alterado",
  "member.invited": "Convite enviado",
  "member.invite_resent": "Convite reenviado",
  "member.role_updated": "Papel alterado",
  "member.revoked": "Acesso revogado",
  "uazapi.connection.tested": "Conexão testada",
  "uazapi.webhook.installed": "Webhook instalado"
};

export function AdminHub({ workspaceId, onWorkspacesChanged }: { workspaceId: string; onWorkspacesChanged: () => Promise<void> }) {
  const [section, setSection] = useState<AdminSection>("workspaces");
  return (
    <div className="page admin-page">
      <section className="page-title admin-title">
        <div><p className="eyebrow">Controle da plataforma</p><h1>Administração</h1></div>
        <p>Gerencie os ambientes da agência, os acessos da equipe e a trilha das mudanças.</p>
      </section>
      <nav className="admin-tabs" aria-label="Seções administrativas">
        <button className={section === "workspaces" ? "active" : ""} onClick={() => setSection("workspaces")}><span>01</span>Workspaces</button>
        <button className={section === "team" ? "active" : ""} onClick={() => setSection("team")}><span>02</span>Equipe</button>
        <button className={section === "audit" ? "active" : ""} onClick={() => setSection("audit")}><span>03</span>Auditoria</button>
      </nav>
      {section === "workspaces" && <WorkspacesPanel onChanged={onWorkspacesChanged} />}
      {section === "team" && <TeamPanel workspaceId={workspaceId} />}
      {section === "audit" && <AuditPanel workspaceId={workspaceId} />}
    </div>
  );
}

function WorkspacesPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminWorkspace | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const response = await api<{ data: AdminWorkspace[] }>("/api/admin/workspaces");
      setWorkspaces(response.data);
    } catch (nextError) { setError(friendlyError(nextError)); }
  }
  useEffect(() => { void load(); }, []);

  function startCreate() {
    setCreating(true); setEditing(null); setName(""); setSlug(""); setError(""); setNotice("");
  }
  function startEdit(workspace: AdminWorkspace) {
    setEditing(workspace); setCreating(false); setName(workspace.name); setSlug(workspace.slug); setError(""); setNotice("");
  }
  function closeForm() { setCreating(false); setEditing(null); setError(""); }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      if (editing) {
        await api(`/api/admin/workspaces/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setNotice("Nome do workspace atualizado.");
      } else {
        await api("/api/admin/workspaces", { method: "POST", body: JSON.stringify({ name, slug }) });
        setNotice("Workspace criado.");
      }
      closeForm();
      await Promise.all([load(), onChanged()]);
    } catch (nextError) { setError(friendlyError(nextError)); }
  }

  return (
    <section className="admin-surface" aria-labelledby="workspaces-heading">
      <header className="admin-surface-heading"><div><p className="eyebrow">Ambientes</p><h2 id="workspaces-heading">Workspaces da agência</h2><p>O nome pode mudar. O identificador permanece estável para proteger integrações.</p></div><button className="button primary" onClick={startCreate}>Novo workspace</button></header>
      {(creating || editing) && <form className="admin-editor" onSubmit={save}><div><p className="eyebrow">{editing ? "Editar workspace" : "Novo workspace"}</p><h3>{editing ? editing.name : "Criar ambiente"}</h3></div><label className="field"><span>Nome</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do cliente" /></label><label className="field"><span>Identificador</span><input required={!editing} readOnly={Boolean(editing)} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="cliente-identificador" /><small>{editing ? "O identificador não pode ser alterado nesta versão." : "Letras minúsculas, números e hífen."}</small></label><div className="admin-editor-actions"><button type="button" className="button secondary" onClick={closeForm}>Cancelar</button><button className="button primary">Salvar alterações</button></div></form>}
      {notice && <AdminNotice tone="success">{notice}</AdminNotice>}{error && <AdminNotice tone="error">{error}</AdminNotice>}
      <div className="table-wrap admin-table"><table><thead><tr><th>Workspace</th><th>Identificador</th><th>Equipe</th><th>Atualizado</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{workspaces.map((workspace) => <tr key={workspace.id}><td data-label="Workspace"><strong>{workspace.name}</strong><small>{workspace.id.slice(0, 8)}</small></td><td data-label="Identificador"><code>{workspace.slug}</code></td><td data-label="Equipe">{workspace.memberCount} integrantes</td><td data-label="Atualizado">{formatDate(workspace.updatedAt)}</td><td data-label="Ação" className="table-action"><button className="button secondary compact" onClick={() => startEdit(workspace)}>Editar</button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function TeamPanel({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!workspaceId) return;
    try { const response = await api<{ data: Member[] }>(`/api/admin/workspaces/${workspaceId}/members`); setMembers(response.data); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }
  useEffect(() => { void load(); }, [workspaceId]);

  async function invite(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try { await api(`/api/admin/workspaces/${workspaceId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }); setEmail(""); setInviting(false); setNotice("Convite preparado para o integrante."); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }
  async function changeRole(member: Member, nextRole: Role) {
    setError(""); setNotice("");
    try { await api(`/api/admin/workspaces/${workspaceId}/members/${member.userId}`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) }); setNotice("Papel atualizado."); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }
  async function revoke(member: Member) {
    setError(""); setNotice("");
    try { await api(`/api/admin/workspaces/${workspaceId}/members/${member.userId}`, { method: "DELETE" }); setNotice("Acesso revogado."); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }
  async function resend(member: Member) {
    setError(""); setNotice("");
    try { await api(`/api/admin/workspaces/${workspaceId}/members/${member.userId}/resend`, { method: "POST" }); setNotice("Convite reenviado."); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }

  return (
    <section className="admin-surface" aria-labelledby="team-heading">
      <header className="admin-surface-heading"><div><p className="eyebrow">Acessos</p><h2 id="team-heading">Equipe do workspace</h2><p>Os papéis definem o alcance de cada pessoa neste ambiente.</p></div><button className="button primary" onClick={() => setInviting((current) => !current)}>Convidar integrante</button></header>
      {inviting && <form className="admin-editor team-editor" onSubmit={invite}><div><p className="eyebrow">Novo acesso</p><h3>Convidar integrante</h3></div><label className="field"><span>E-mail</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com.br" /></label><label className="field"><span>Papel</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="admin-editor-actions"><button type="button" className="button secondary" onClick={() => setInviting(false)}>Cancelar</button><button className="button primary">Enviar convite</button></div></form>}
      {notice && <AdminNotice tone="success">{notice}</AdminNotice>}{error && <AdminNotice tone="error">{error}</AdminNotice>}
      <div className="table-wrap admin-table"><table><thead><tr><th>Integrante</th><th>Estado</th><th>Papel</th><th>Desde</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td data-label="Integrante"><strong>{member.email}</strong><small>{member.userId.slice(0, 8)}</small></td><td data-label="Estado"><span className={`member-state ${member.status}`}><i />{member.status === "active" ? "Ativo" : "Convite pendente"}</span></td><td data-label="Papel"><select className="role-select" aria-label={`Papel de ${member.email}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td data-label="Desde">{formatDate(member.createdAt)}</td><td data-label="Ações" className="table-actions">{member.status === "pending" && <button className="text-action" onClick={() => void resend(member)}>Reenviar</button>}<button className="text-action danger" onClick={() => void revoke(member)}>Revogar</button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function AuditPanel({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  async function load() {
    if (!workspaceId) return;
    try { const response = await api<{ data: AuditEntry[] }>(`/api/admin/workspaces/${workspaceId}/audit`); setEntries(response.data); }
    catch (nextError) { setError(friendlyError(nextError)); }
  }
  useEffect(() => { void load(); }, [workspaceId]);
  return (
    <section className="admin-surface" aria-labelledby="audit-heading">
      <header className="admin-surface-heading"><div><p className="eyebrow">Rastreabilidade</p><h2 id="audit-heading">Log de alterações</h2><p>Ações administrativas e operacionais, sem credenciais ou conteúdo de conversa.</p></div><button className="button secondary" onClick={() => void load()}>Atualizar</button></header>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <ol className="audit-list">{entries.map((entry) => <li key={entry.id}><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time><span className="audit-mark" /><div className="audit-card"><div className="audit-card-heading"><strong>{actionLabels[entry.action] ?? entry.action}</strong><span>{entry.targetType}</span></div><p>{entry.detail}</p><footer><span>{entry.actorEmail}</span><code>{entry.targetLabel}</code></footer></div></li>)}</ol>
    </section>
  );
}

function AdminNotice({ tone, children }: { tone: "success" | "error"; children: string }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{children}</span></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
