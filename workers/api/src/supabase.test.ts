import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { supabaseJson } from "./supabase";

describe("Supabase API key transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the project secret in apikey without treating it as a bearer JWT", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe("sb_secret_fixture");
      expect(headers.get("authorization")).toBeNull();
      return new Response(JSON.stringify([{ id: "fixture" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await supabaseJson<Array<{ id: string }>>({
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_fixture"
    } as Env, "/rest/v1/workspaces?select=id");

    expect(result).toEqual([{ id: "fixture" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
