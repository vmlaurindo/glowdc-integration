export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "operator" || value === "viewer";
}

export function canManageRole(actorRole: string, targetRole: string): boolean {
  return actorRole === "platform_admin" || actorRole === "owner" ||
    (actorRole === "admin" && (targetRole === "operator" || targetRole === "viewer"));
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
  if (action === "uazapi.webhook.installed") return "Webhook de entrada instalado.";
  if (action === "meta.destination.configured") return "Destino Meta configurado.";
  if (action === "meta.delivery.activated") return "Envio de conversões ativado.";
  if (action === "meta.delivery.observation_enabled") return "Envios retornaram ao modo de observação.";
  if (action === "delivery.requeued" || action === "meta.conversion.requeued") return "Processamento reenfileirado.";
  return "Alteração registrada.";
}
