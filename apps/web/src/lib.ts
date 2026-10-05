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
  const diagnostic = (error as { payload?: { diagnostic?: { code?: unknown; summary?: unknown; httpStatus?: unknown } } })?.payload?.diagnostic;
  if (typeof diagnostic?.summary === "string") {
    return `${diagnostic.summary} · ${String(diagnostic.code ?? "uazapi_error")}`;
  }
  const summary = (error as { payload?: { summary?: unknown } })?.payload?.summary;
  if (typeof summary === "string") return summary;
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
    uazapi_webhook_mismatch: "A configuração salva na UAZAPI não corresponde a este workspace.",
    uazapi_connection_failed: "Não foi possível testar a UAZAPI. Verifique a URL, a instância e o token.",
    connection_label_conflict: "Já existe uma conexão com esse nome neste workspace.",
    connection_test_required: "Teste a conexão com sucesso depois de suspendê-la para poder retomar.",
    connection_suspended: "Esta conexão está suspensa. Retome-a após um teste bem-sucedido.",
    provider_url_host_not_allowed: "O domínio da instância não está autorizado.",
    webhook_not_installed: "Instale o webhook antes de ativar os envios.",
    connection_not_tested: "Teste a conexão antes de ativar os envios.",
    meta_destination_missing: "Configure o destino Meta antes de ativar os envios.",
    workspace_access_denied: "Seu acesso a este workspace não permite essa ação."
    ,invalid_agendor_integration: "Revise o nome, a URL v3 e o token do Agendor."
    ,agendor_integration_conflict: "Já existe uma integração Agendor com esse nome neste workspace."
    ,agendor_integration_not_found: "Esta integração Agendor não foi encontrada."
    ,agendor_connection_failed: "Não foi possível validar a conta Agendor."
    ,agendor_catalog_failed: "Não foi possível carregar os catálogos do Agendor."
    ,agendor_https_required: "A API do Agendor precisa usar HTTPS."
    ,agendor_api_v3_required: "Use a URL https://api.agendor.com.br/v3."
  };
  return messages[code] ?? `Não foi possível concluir: ${code.replaceAll("_", " ")}.`;
}
