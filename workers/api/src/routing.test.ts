import { describe, expect, it } from "vitest";
import { requestWithoutBasePath } from "./index";

describe("GlowDC public base path", () => {
  it("removes the base path before routing API calls", () => {
    const request = requestWithoutBasePath(
      new Request("https://app.maxio.com.br/glowdc/api/workspaces?active=true"),
      "/glowdc"
    );
    const url = new URL(request.url);
    expect(url.pathname).toBe("/api/workspaces");
    expect(url.search).toBe("?active=true");
  });

  it("maps the exact application path to the asset root", () => {
    const request = requestWithoutBasePath(
      new Request("https://app.maxio.com.br/glowdc"),
      "/glowdc"
    );
    expect(new URL(request.url).pathname).toBe("/");
  });

  it("does not consume a similar but unrelated prefix", () => {
    const request = requestWithoutBasePath(
      new Request("https://app.maxio.com.br/glowdc-other/login"),
      "/glowdc"
    );
    expect(new URL(request.url).pathname).toBe("/glowdc-other/login");
  });
});
