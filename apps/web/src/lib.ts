import { createClient } from "@supabase/supabase-js";
import { isLocalMockMode, localMockApi } from "./mock-api";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const apiUrl = import.meta.env.VITE_API_URL.replace(/\/$/, "");

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isLocalMockMode()) return localMockApi<T>(path, init);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("session_expired");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : `http_${response.status}`;
    const error = new Error(detail);
    Object.assign(error, { payload, status: response.status });
    throw error;
  }
  return payload as T;
}

export function friendlyError(error: unknown): string {
  const code = error instanceof Error ? error.message : "unknown_error";
  const messages: Record<string, string> = {
    workspace_slug_conflict: "Este identificador já está em uso.",
    invalid_workspace: "Revise o nome e o identificador do workspace.",
    invalid_member: "Revise o e-mail e o papel do integrante.",
    member_already_exists: "Esta pessoa já participa do workspace.",
    member_not_found: "Este integrante não foi encontrado no workspace.",
    last_owner_required: "O workspace precisa manter pelo menos um owner.",
    invite_not_pending: "Este convite não está pendente.",
    invite_failed: "Não foi possível enviar o convite pelo serviço de autenticação.",
    invalid_account: "Revise o nome e o e-mail da conta.",
    invalid_current_password: "A senha atual não confere.",
    account_update_failed: "Não foi possível atualizar os dados da conta.",
    workspace_not_found: "Este workspace não foi encontrado.",
    weak_password: "A nova senha precisa ter pelo menos 12 caracteres.",
    invalid_login_credentials: "E-mail ou senha não conferem.",
    session_expired: "Sua sessão expirou. Entre novamente.",
    automatic_webhook_failed: "A instalação automática falhou. Use as instruções manuais exibidas.",
    provider_url_host_not_allowed: "O domínio da instância não está autorizado.",
    webhook_not_installed: "Instale o webhook antes de ativar os envios.",
    connection_not_tested: "Teste a conexão antes de ativar os envios.",
    meta_destination_missing: "Configure o destino Meta antes de ativar os envios.",
    workspace_access_denied: "Seu acesso a este workspace não permite essa ação."
  };
  return messages[code] ?? `Não foi possível concluir: ${code.replaceAll("_", " ")}.`;
}
