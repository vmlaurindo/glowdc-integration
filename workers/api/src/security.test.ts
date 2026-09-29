import { describe, expect, it } from "vitest";
import { assertAllowedProviderUrl, sanitizePayload } from "./security";

describe("provider URL policy", () => {
  it("accepts configured HTTPS subdomains", () => {
    expect(assertAllowedProviderUrl("https://client.uazapi.com/", ".uazapi.com").hostname)
      .toBe("client.uazapi.com");
  });

  it.each([
    "http://client.uazapi.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://attacker.example"
  ])("blocks unsafe provider URL %s", (url) => {
    expect(() => assertAllowedProviderUrl(url, ".uazapi.com")).toThrow();
  });
});

it("redacts secret-shaped keys recursively", () => {
  expect(sanitizePayload({ token: "secret", nested: { access_token: "secret", ok: "value" } }))
    .toEqual({ token: "[redacted]", nested: { access_token: "[redacted]", ok: "value" } });
});

