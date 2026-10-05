import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { hasWorkspaceReadAccess, supabaseJson } from "./supabase";

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

describe("workspace dashboard read access", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("allows a platform admin without a workspace membership", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const rows = url.pathname.endsWith("/workspace_members") ? [] : [{ user_id: "admin-fixture" }];
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hasWorkspaceReadAccess({ SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture" } as Env, "workspace-fixture", "admin-fixture"))
      .resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("denies an unrelated user without a membership", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    await expect(hasWorkspaceReadAccess({ SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture" } as Env, "workspace-fixture", "user-fixture"))
      .resolves.toBe(false);
  });

  it("allows an existing member without checking platform-admin status", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const rows = url.pathname.endsWith("/workspace_members") ? [{ role: "viewer" }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hasWorkspaceReadAccess({ SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture" } as Env, "workspace-fixture", "member-fixture"))
      .resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
