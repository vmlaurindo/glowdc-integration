import { assertAllowedProviderUrl } from "./security";
import type { ConnectionDiagnostic } from "@glowdc/contracts";

export interface UazapiCredentials {
  token: string;
}

export class UazapiRequestError extends Error {
  constructor(readonly diagnostic: ConnectionDiagnostic, readonly detail: string) {
    super(diagnostic.summary);
    this.name = "UazapiRequestError";
  }
}

export function classifyUazapiStatus(status: number): { status: number; connected: boolean; diagnostic: ConnectionDiagnostic } {
  let category: ConnectionDiagnostic["category"] = "provider";
  let summary = `A UAZAPI respondeu com HTTP ${status}.`;
  if (status === 401) {
    category = "credentials";
    summary = "O token da instância foi rejeitado (HTTP 401). Confira a credencial salva.";
  } else if (status === 403) {
    category = "permission";
    summary = "A instância negou acesso (HTTP 403). Confira as permissões no provedor.";
  } else if (status === 404) {
    category = "not_found";
    summary = "A rota ou instância não foi encontrada (HTTP 404). Confira a URL da instância.";
  } else if (status === 408 || status === 504) {
    category = "timeout";
    summary = `A UAZAPI excedeu o tempo de resposta (HTTP ${status}). Tente novamente.`;
  } else if (status === 429) {
    category = "rate_limit";
    summary = "O limite de chamadas da UAZAPI foi atingido (HTTP 429). Aguarde e tente novamente.";
  } else if (status >= 500) {
    category = "provider";
    summary = `A UAZAPI está indisponível ou respondeu com erro (HTTP ${status}). Tente novamente.`;
  }
  return {
    status,
    connected: status >= 200 && status < 300,
    diagnostic: { code: `uazapi_http_${status}`, category, httpStatus: status, summary }
  };
}

export function diagnoseUazapiError(error: unknown, secret?: string): ConnectionDiagnostic & { detail: string } {
  if (error instanceof UazapiRequestError) return { ...error.diagnostic, detail: sanitizeUazapiDetail(error.detail, secret) };
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid redirect value|redirect.*(not implemented|unsupported)/i.test(message)) {
    return {
      code: "uazapi_worker_redirect_mode_unsupported", category: "configuration", httpStatus: null,
      summary: "A configuração de redirecionamento do Worker bloqueou o teste.",
      detail: sanitizeUazapiDetail(message, secret)
    };
  }
  if (/invalid_cipher_envelope|encryption_key_must_be_32_bytes|operation-specific authentication tag/i.test(message)) {
    return {
      code: "uazapi_credentials_unavailable", category: "configuration", httpStatus: null,
      summary: "Não foi possível ler com segurança as credenciais salvas. Salve-as novamente.",
      detail: sanitizeUazapiDetail(message, secret)
    };
  }
  if (error instanceof TypeError || /fetch failed|network|timeout|timed out|dns/i.test(message)) {
    return {
      code: "uazapi_network_error", category: "network", httpStatus: null,
      summary: "Não foi possível alcançar a instância UAZAPI. Confira a URL e tente novamente.",
      detail: sanitizeUazapiDetail(message, secret)
    };
  }
  return {
    code: "uazapi_unexpected_error", category: "unknown", httpStatus: null,
    summary: "Ocorreu uma falha inesperada no teste UAZAPI. Consulte o histórico administrativo.",
    detail: sanitizeUazapiDetail(message, secret)
  };
}

export function sanitizeUazapiDetail(value: string, secret?: string): string {
  let detail = value.slice(0, 2000);
  if (secret) detail = detail.replaceAll(secret, "[segredo removido]");
  detail = detail
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [segredo removido]")
    .replace(/["']?(authorization|access[_ -]?token|instance[_ -]?token|password|senha|token)["']?\s*[:=]\s*["']?[^\s,"';}]+["']?/gi, "$1=[segredo removido]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[e-mail removido]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[contato removido]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
      try { return `${new URL(raw).origin}/[rota removida]`; }
      catch { return "[URL removida]"; }
    });
  return detail.slice(0, 2000) || "Erro sem detalhe textual.";
}

async function providerFetch(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = assertAllowedProviderUrl(baseUrl, allowedHosts);
  const basePath = base.pathname.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${basePath}${normalizedPath}`, base.origin);
  return fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      token: credentials.token,
      "Content-Type": "application/json",
      ...init.headers
    }
  }).then((response) => {
    if (response.status >= 300 && response.status < 400) {
      const diagnostic: ConnectionDiagnostic = {
        code: "uazapi_redirect_blocked", category: "redirect", httpStatus: response.status,
        summary: `A instância respondeu com redirecionamento HTTP ${response.status}; o token não foi encaminhado.`
      };
      throw new UazapiRequestError(diagnostic, diagnostic.summary);
    }
    return response;
  });
}

export async function testUazapiConnection(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials
): Promise<{ connected: boolean; status: number; diagnostic: ConnectionDiagnostic | null }> {
  const response = await providerFetch(baseUrl, allowedHosts, credentials, "/instance/status");
  const result = classifyUazapiStatus(response.status);
  return { ...result, diagnostic: result.connected ? null : result.diagnostic };
}

export interface UazapiWebhookVerification {
  verified: boolean;
  reason: "verified" | "destination_not_found" | "duplicate_destinations" | "disabled" | "events_mismatch" | "filters_mismatch" | "dynamic_url";
  checks: {
    destination: boolean;
    enabled: boolean;
    events: boolean;
    filters: boolean;
    staticUrl: boolean;
  };
}

interface UazapiWebhookRecord {
  enabled?: unknown;
  url?: unknown;
  events?: unknown;
  excludeMessages?: unknown;
  addUrlEvents?: unknown;
  addUrlTypesMessages?: unknown;
}

export async function verifyUazapiWebhook(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials,
  expectedUrl: string
): Promise<UazapiWebhookVerification> {
  const response = await providerFetch(baseUrl, allowedHosts, credentials, "/webhook");
  if (!response.ok) {
    const result = classifyUazapiStatus(response.status);
    throw new UazapiRequestError(result.diagnostic, `Consulta do webhook UAZAPI retornou HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UazapiRequestError({
      code: "uazapi_webhook_invalid_response", category: "provider", httpStatus: response.status,
      summary: "A UAZAPI respondeu em formato inesperado ao consultar o webhook."
    }, "Formato JSON inválido em GET /webhook.");
  }
  if (!Array.isArray(payload)) {
    throw new UazapiRequestError({
      code: "uazapi_webhook_invalid_response", category: "provider", httpStatus: response.status,
      summary: "A UAZAPI respondeu em formato inesperado ao consultar o webhook."
    }, "A resposta de GET /webhook não é uma lista.");
  }

  const expected = normalizeWebhookUrl(expectedUrl);
  const matches = (payload as UazapiWebhookRecord[]).filter((item) =>
    expected !== "" && typeof item?.url === "string" && normalizeWebhookUrl(item.url) === expected
  );
  const item = matches.length === 1 ? matches[0] : null;
  const events = Array.isArray(item?.events) ? item.events : [];
  const filters = Array.isArray(item?.excludeMessages) ? item.excludeMessages : [];
  const checks = {
    destination: matches.length === 1,
    enabled: item?.enabled === true,
    events: events.includes("messages") && events.includes("connection"),
    filters: filters.includes("fromMeYes") && filters.includes("isGroupYes"),
    staticUrl: item?.addUrlEvents === false && item?.addUrlTypesMessages === false
  };

  let reason: UazapiWebhookVerification["reason"] = "verified";
  if (matches.length === 0) reason = "destination_not_found";
  else if (matches.length > 1) reason = "duplicate_destinations";
  else if (!checks.enabled) reason = "disabled";
  else if (!checks.events) reason = "events_mismatch";
  else if (!checks.filters) reason = "filters_mismatch";
  else if (!checks.staticUrl) reason = "dynamic_url";

  return { verified: reason === "verified", reason, checks };
}

function normalizeWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${pathname}`;
  } catch {
    return "";
  }
}
