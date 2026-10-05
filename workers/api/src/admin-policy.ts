export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "operator" || value === "viewer";
}

export function canManageRole(actorRole: string, targetRole: string): boolean {
  return actorRole === "platform_admin" || actorRole === "owner" ||
    (actorRole === "admin" && (targetRole === "operator" || targetRole === "viewer"));
}

export function canReadWorkspace(memberRole: string | null, platformAdmin: boolean): boolean {
  return memberRole !== null || platformAdmin;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function auditDetail(action: string, metadata: Record<string, unknown>): string {
  if (action === "workspace.created") return "Workspace criado.";
  if (action === "workspace.updated" && typeof metadata.previousName === "string" && typeof metadata.name === "string") {
    return `Nome alterado de ${metadata.previousName} para ${metadata.name}.`;
  }
  if (action === "member.invited" && typeof metadata.role === "string") return `Acesso criado com papel ${metadata.role}.`;
  if (action === "member.role_updated" && typeof metadata.previousRole === "string" && typeof metadata.role === "string") {
    return `Papel alterado de ${metadata.previousRole} para ${metadata.role}.`;
  }
  if (action === "member.revoked" && typeof metadata.previousRole === "string") return `Acesso ${metadata.previousRole} revogado.`;
  if (action === "member.invite_resent") return "Convite reenviado.";
  if (action === "uazapi.connection.tested") return metadata.connected === true ? "Conexão confirmada." : "Teste de conexão concluído.";
  if (action === "uazapi.connection.test_failed") {
    const code = typeof metadata.diagnosticCode === "string" ? metadata.diagnosticCode : "uazapi_unexpected_error";
    const category = typeof metadata.category === "string" ? metadata.category : "unknown";
    const status = typeof metadata.httpStatus === "number" ? ` · HTTP ${metadata.httpStatus}` : "";
    const summary = typeof metadata.summary === "string" ? metadata.summary : "Falha no teste de conexão.";
    const detail = typeof metadata.detail === "string" ? metadata.detail : "Detalhe técnico indisponível.";
    return `${code} · ${category}${status}\n${summary}\nDetalhe: ${detail}`;
  }
  if (action === "uazapi.webhook.install_failed") {
    const code = typeof metadata.diagnosticCode === "string" ? metadata.diagnosticCode : "uazapi_unexpected_error";
    const category = typeof metadata.category === "string" ? metadata.category : "unknown";
    const status = typeof metadata.httpStatus === "number" ? ` · HTTP ${metadata.httpStatus}` : "";
    const summary = typeof metadata.summary === "string" ? metadata.summary : "Falha na instalação do webhook.";
    const detail = typeof metadata.detail === "string" ? metadata.detail : "Detalhe técnico indisponível.";
    return `${code} · ${category}${status}\n${summary}\nDetalhe: ${detail}`;
  }
  if (action === "uazapi.webhook.verified") return "Configuração do webhook UAZAPI consultada e confirmada; nenhuma alteração foi enviada ao provedor.";
  if (action === "uazapi.webhook.verify_failed") {
    const reason = typeof metadata.reason === "string" ? metadata.reason :
      typeof metadata.diagnosticCode === "string" ? metadata.diagnosticCode : "uazapi_webhook_unverified";
    const summary = typeof metadata.summary === "string" ? metadata.summary : "A configuração atual do webhook não foi confirmada.";
    return `${reason}\n${summary}`;
  }
  if (action === "uazapi.connection.created") return "Nova conexão UAZAPI cadastrada; token mantido cifrado.";
  if (action === "uazapi.connection.updated") return `Conexão atualizada. URL alterada: ${metadata.baseUrlChanged === true ? "sim" : "não"}; token rotacionado: ${metadata.tokenRotated === true ? "sim" : "não"}.`;
  if (action === "uazapi.connection.suspended") return "Conexão suspensa de forma reversível; histórico preservado.";
  if (action === "uazapi.connection.resumed") return "Conexão retomada em modo observação após teste bem-sucedido.";
  if (action === "uazapi.webhook.installed") return "Webhook de entrada instalado.";
  if (action === "meta.destination.configured") return "Destino Meta configurado.";
  if (action === "meta.delivery.activated") return "Envio de conversões ativado.";
  if (action === "meta.delivery.observation_enabled") return "Envios retornaram ao modo de observação.";
  if (action === "delivery.requeued" || action === "meta.conversion.requeued") return "Processamento reenfileirado.";
  return "Alteração registrada.";
}
