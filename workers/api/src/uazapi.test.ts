import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyUazapiStatus,
  diagnoseUazapiError,
  sanitizeUazapiDetail,
  testUazapiConnection,
  verifyUazapiWebhook
} from "./uazapi";

describe("UAZAPI connection requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the instance host when the configured URL has no path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://client.uazapi.com/instance/status");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(testUazapiConnection("https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }))
      .resolves.toEqual({ connected: true, status: 200, diagnostic: null });
  });

  it("preserves a configured base path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://client.uazapi.com/api/instance/status");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await testUazapiConnection("https://client.uazapi.com/api/", ".uazapi.com", { token: "fixture-token" });
  });

  it("uses manual redirect handling and rejects redirects without following them", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return Response.redirect("https://other.example/collect", 302);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(testUazapiConnection("https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }))
      .rejects.toMatchObject({ diagnostic: { code: "uazapi_redirect_blocked", httpStatus: 302 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "credentials", "uazapi_http_401"],
    [403, "permission", "uazapi_http_403"],
    [404, "not_found", "uazapi_http_404"],
    [408, "timeout", "uazapi_http_408"],
    [429, "rate_limit", "uazapi_http_429"],
    [504, "timeout", "uazapi_http_504"],
    [503, "provider", "uazapi_http_503"]
  ] as const)("classifies UAZAPI HTTP %i", (status, category, code) => {
    expect(classifyUazapiStatus(status)).toMatchObject({ status, diagnostic: { category, code } });
  });

  it("sanitizes unknown runtime errors before audit display", () => {
    const diagnostic = diagnoseUazapiError(
      new Error("unexpected failure for https://client.uazapi.com?token=fixture-secret; contact +55 11 99999-1234"),
      "fixture-secret"
    );
    expect(diagnostic.code).toBe("uazapi_unexpected_error");
    expect(diagnostic.summary).toBeTruthy();
    expect(diagnostic.detail).not.toContain("fixture-secret");
    expect(diagnostic.detail).not.toContain("99999-1234");
    expect(sanitizeUazapiDetail('{"token":"fixture-secret","authorization":"Bearer hidden-value"}'))
      .not.toContain("hidden-value");
  });
});

describe("UAZAPI webhook verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  const callbackUrl = "https://app.maxio.com.br/glowdc/webhooks/uazapi/connection-fixture";

  it("reads the provider configuration and accepts the expected static webhook", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://client.uazapi.com/webhook");
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json([{
        id: "provider-webhook-fixture",
        enabled: true,
        url: callbackUrl,
        events: ["messages", "connection", "messages_update"],
        excludeMessages: ["fromMeYes", "isGroupYes"],
        addUrlEvents: false,
        addUrlTypesMessages: false
      }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyUazapiWebhook(
      "https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }, callbackUrl
    )).resolves.toMatchObject({
      verified: true,
      checks: { destination: true, enabled: true, events: true, filters: true, staticUrl: true }
    });
  });

  it("does not verify a webhook that points to a different URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{
      enabled: true,
      url: "https://wrong.example/receiver?token=must-not-leak",
      events: ["messages", "connection"],
      excludeMessages: ["fromMeYes", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false
    }])));

    const result = await verifyUazapiWebhook(
      "https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }, callbackUrl
    );
    expect(result).toMatchObject({
      verified: false,
      reason: "destination_not_found",
      checks: { destination: false }
    });
    expect(JSON.stringify(result)).not.toContain("wrong.example");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("rejects disabled destinations, missing events, unsafe filters and dynamic URL suffixes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{
      enabled: true,
      url: callbackUrl,
      events: ["messages"],
      excludeMessages: ["fromMeNo"],
      addUrlEvents: true,
      addUrlTypesMessages: false
    }, {
      enabled: false,
      url: callbackUrl,
      events: ["messages", "connection"],
      excludeMessages: ["fromMeYes", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false
    }])));

    const result = await verifyUazapiWebhook(
      "https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }, callbackUrl
    );
    expect(result.verified).toBe(false);
    expect(result.reason).not.toBe("verified");
    expect(result.checks).toMatchObject({ enabled: false, events: false, filters: false, staticUrl: false });
  });

  it("rejects duplicate enabled destinations for the same callback", async () => {
    const entry = {
      enabled: true,
      url: callbackUrl,
      events: ["messages", "connection"],
      excludeMessages: ["fromMeYes", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([entry, entry])));

    await expect(verifyUazapiWebhook(
      "https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }, callbackUrl
    )).resolves.toMatchObject({ verified: false, reason: "duplicate_destinations" });
  });

  it("rejects an unexpected response shape without exposing provider data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ token: "fixture-secret" })));
    await expect(verifyUazapiWebhook(
      "https://client.uazapi.com", ".uazapi.com", { token: "fixture-token" }, callbackUrl
    )).rejects.toMatchObject({ diagnostic: { code: "uazapi_webhook_invalid_response" } });
  });
});
