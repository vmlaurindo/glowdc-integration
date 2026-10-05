import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Env } from "./env";
import worker from "./index";

const supabaseUrl = "https://workspace-home-fixture.supabase.co";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const keyPairPromise = generateKeyPair("RS256");

async function signedToken() {
  const { privateKey } = await keyPairPromise;
  return new SignJWT({ email: "qa@example.invalid" })
    .setProtectedHeader({ alg: "RS256", kid: "workspace-home-fixture" })
    .setSubject(userId)
    .setIssuer(`${supabaseUrl}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function fixture(platformAdmin: boolean) {
  const { publicKey } = await keyPairPromise;
  const jwk = await exportJWK(publicKey);
  const supabaseCalls: Array<{ path: string; method: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "workspace-home-fixture", use: "sig", alg: "RS256" }] }), { status: 200 });
    }
    const method = init?.method ?? "GET";
    supabaseCalls.push({ path: url.pathname, method });
    if (url.pathname.endsWith("/workspace_members")) return new Response("[]", { status: 200 });
    if (url.pathname.endsWith("/platform_admins")) return new Response(JSON.stringify(platformAdmin ? [{ user_id: userId }] : []), { status: 200 });
    if (url.pathname.startsWith("/rest/v1/")) return new Response("[]", { status: 200 });
    return new Response("{}", { status: 404 });
  }));
  const env = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SECRET_KEY: "sb_secret_workspace_home_fixture",
    PUBLIC_API_BASE_URL: "https://app.maxio.com.br/glowdc",
    WEB_APP_ORIGIN: "https://app.maxio.com.br",
    APP_BASE_PATH: "/glowdc"
  } as Env;
  const token = await signedToken();
  return { env, token, supabaseCalls };
}

async function call(path: string, method: string, fixtureResult: Awaited<ReturnType<typeof fixture>>, body?: unknown) {
  const request = new Request(`https://app.maxio.com.br/glowdc${path}`, {
    method,
    headers: { Authorization: `Bearer ${fixtureResult.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return worker.fetch(request, fixtureResult.env, {} as ExecutionContext);
}

describe("platform admin workspace read-only routes", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(["connections", "leads", "operations"] as const)("allows a platform admin to read %s without membership", async (resource) => {
    const state = await fixture(true);
    const response = await call(`/api/${resource}?workspaceId=${workspaceId}`, "GET", state);
    expect(response.status).toBe(200);
    expect(state.supabaseCalls.some((item) => item.path.endsWith("/platform_admins"))).toBe(true);
  });

  it("returns 403 to a user without membership or platform-admin status", async () => {
    const state = await fixture(false);
    const response = await call(`/api/leads?workspaceId=${workspaceId}`, "GET", state);
    expect(response.status).toBe(403);
    expect(state.supabaseCalls.some((item) => item.path.endsWith("/rest/v1/leads"))).toBe(false);
  });

  it("keeps connection creation denied to a platform admin without membership", async () => {
    const state = await fixture(true);
    const writeLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await call("/api/connections", "POST", state, {
      workspaceId,
      label: "Fixture sintética",
      baseUrl: "https://fixture.uazapi.com",
      token: "synthetic-token"
    });
    expect(response.status).toBe(403);
    expect(state.supabaseCalls.some((item) => item.path.endsWith("/provider_connections") && item.method === "POST")).toBe(false);
    writeLog.mockRestore();
  });
});
