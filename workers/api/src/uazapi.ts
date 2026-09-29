import { assertAllowedProviderUrl } from "./security";

export interface UazapiCredentials {
  token: string;
}

async function providerFetch(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = assertAllowedProviderUrl(baseUrl, allowedHosts);
  const url = new URL(`${base.pathname}${path}`, `${base.origin}/`);
  return fetch(url, {
    ...init,
    redirect: "error",
    headers: {
      token: credentials.token,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
}

export async function testUazapiConnection(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials
): Promise<{ connected: boolean; status: number }> {
  const response = await providerFetch(baseUrl, allowedHosts, credentials, "/instance/status");
  return { connected: response.ok, status: response.status };
}

export async function installUazapiWebhook(
  baseUrl: string,
  allowedHosts: string,
  credentials: UazapiCredentials,
  webhookUrl: string
): Promise<void> {
  const response = await providerFetch(baseUrl, allowedHosts, credentials, "/webhook", {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      events: ["messages", "connection"],
      excludeMessages: ["fromMeYes", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false
    })
  });
  if (!response.ok) throw new Error(`uazapi_webhook_${response.status}`);
}

