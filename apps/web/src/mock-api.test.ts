import { describe, expect, it } from "vitest";
import { createMockApi, isLocalMockUrl } from "./mock-api";

describe("local admin mock", () => {
  it("can only be enabled in development", () => {
    expect(isLocalMockUrl("http://localhost:5173/glowdc/dashboard?mock-admin=1", true)).toBe(true);
    expect(isLocalMockUrl("http://127.0.0.1:5173/glowdc/dashboard?mock-admin=1", true)).toBe(true);
    expect(isLocalMockUrl("http://dev.example/glowdc/dashboard?mock-admin=1", true)).toBe(false);
    expect(isLocalMockUrl("https://app.maxio.com.br/glowdc/dashboard?mock-admin=1", false)).toBe(false);
  });

  it("starts with the GlowDC workspace and keeps rename in memory", async () => {
    const api = createMockApi();
    const before = await api<{ data: Array<{ id: string; name: string; slug: string }> }>("/api/admin/workspaces");
    expect(before.data[0]).toMatchObject({ name: "GlowDC", slug: "glowdc" });

    await api(`/api/admin/workspaces/${before.data[0]?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Glow DC Brasil" })
    });

    const after = await api<{ data: Array<{ name: string; slug: string }> }>("/api/admin/workspaces");
    expect(after.data[0]).toMatchObject({ name: "Glow DC Brasil", slug: "glowdc" });
  });

  it("records team mutations in the audit trail", async () => {
    const api = createMockApi();
    const workspaces = await api<{ data: Array<{ id: string }> }>("/api/admin/workspaces");
    const workspaceId = workspaces.data[0]?.id ?? "";
    await api(`/api/admin/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email: "pessoa@exemplo.test", role: "viewer" })
    });

    const audit = await api<{ data: Array<{ action: string; targetLabel: string }> }>(`/api/admin/workspaces/${workspaceId}/audit`);
    expect(audit.data[0]).toMatchObject({ action: "member.invited", targetLabel: "pessoa@exemplo.test" });
  });

  it("does not demote the last workspace owner", async () => {
    const api = createMockApi();
    const workspaces = await api<{ data: Array<{ id: string }> }>("/api/admin/workspaces");
    const workspaceId = workspaces.data[0]?.id ?? "";
    const members = await api<{ data: Array<{ userId: string; role: string }> }>(`/api/admin/workspaces/${workspaceId}/members`);
    const owner = members.data.find((member) => member.role === "owner");

    await expect(api(`/api/admin/workspaces/${workspaceId}/members/${owner?.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" })
    })).rejects.toThrow("last_owner_required");
  });
});
