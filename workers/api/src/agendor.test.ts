import { afterEach, describe, expect, it, vi } from "vitest";
import { AgendorApiError, AgendorClient, createAgendorBaseUrl } from "./agendor";

describe("Agendor client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires the pinned HTTPS v3 API base", () => {
    expect(createAgendorBaseUrl("https://api.agendor.com.br/v3")).toBe("https://api.agendor.com.br/v3");
    expect(() => createAgendorBaseUrl("http://api.agendor.com.br/v3")).toThrow("agendor_https_required");
    expect(() => createAgendorBaseUrl("https://api.agendor.com.br/v2")).toThrow("agendor_api_v3_required");
  });

  it("handles a 429 HTML response with retry and never assumes JSON", async () => {
    const responses = [
      new Response("<html>too many requests</html>", { status: 429, headers: { "X-Request-Id": "req-1" } }),
      new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200, headers: { "X-Request-Id": "req-2" } })
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const client = new AgendorClient({ baseUrl: "https://api.agendor.com.br/v3", token: "fixture-token", fetchImpl, minIntervalMs: 0, sleep: async () => undefined });
    await expect(client.get("/funnels")).resolves.toEqual({ data: { data: [{ id: 1 }] }, requestId: "req-2" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("exposes request id and a bounded body for terminal errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid", { status: 401, headers: { "X-Request-Id": "req-auth" } }));
    const client = new AgendorClient({ baseUrl: "https://api.agendor.com.br/v3", token: "fixture-token", fetchImpl, minIntervalMs: 0, sleep: async () => undefined });
    await expect(client.get("/users/me")).rejects.toMatchObject({ status: 401, requestId: "req-auth", retryable: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps write payloads explicit and preserves the Agendor request id", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({ type: "WHATSAPP" });
      return new Response(JSON.stringify({ data: { id: 42 } }), { status: 201, headers: { "X-Request-Id": "req-write" } });
    });
    const client = new AgendorClient({ baseUrl: "https://api.agendor.com.br/v3", token: "fixture-token", fetchImpl, minIntervalMs: 0, sleep: async () => undefined });
    await expect(client.createTask(42, { text: "fixture", type: "WHATSAPP", finished_date: "2026-10-01T12:00:00.000Z" })).resolves.toEqual({ data: { data: { id: 42 } }, requestId: "req-write" });
  });
});
