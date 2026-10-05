import { describe, expect, it } from "vitest";
import { auditDetail, canManageRole, canReadWorkspace, isUuid, isWorkspaceRole } from "./admin-policy";

describe("platform and workspace administration policy", () => {
  it("keeps local admins inside operator and viewer roles", () => {
    expect(canManageRole("admin", "operator")).toBe(true);
    expect(canManageRole("admin", "viewer")).toBe(true);
    expect(canManageRole("admin", "admin")).toBe(false);
    expect(canManageRole("admin", "owner")).toBe(false);
  });

  it("allows workspace owners and platform admins to manage all roles", () => {
    for (const actor of ["owner", "platform_admin"]) {
      for (const target of ["owner", "admin", "operator", "viewer"]) {
        expect(canManageRole(actor, target)).toBe(true);
      }
    }
  });

  it("accepts only known workspace roles and UUIDs", () => {
    expect(isWorkspaceRole("viewer")).toBe(true);
    expect(isWorkspaceRole("platform_admin")).toBe(false);
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-workspace")).toBe(false);
  });

  it("allows workspace reads to members or platform admins, never unrelated users", () => {
    expect(canReadWorkspace("viewer", false)).toBe(true);
    expect(canReadWorkspace(null, true)).toBe(true);
    expect(canReadWorkspace(null, false)).toBe(false);
  });

  it("formats audit details from approved metadata only", () => {
    expect(auditDetail("workspace.updated", { previousName: "GlowDC", name: "Glow DC" }))
      .toBe("Nome alterado de GlowDC para Glow DC.");
    expect(auditDetail("unknown.action", { token: "must-not-appear" })).toBe("Alteração registrada.");
  });
  it("surfaces categorized provider diagnostics and their sanitized technical detail", () => {
    const detail = auditDetail("uazapi.connection.test_failed", {
      diagnosticCode: "uazapi_http_504", category: "timeout", httpStatus: 504,
      summary: "Tempo de resposta excedido.", detail: "Gateway Timeout (rota removida)"
    });
    expect(detail).toContain("uazapi_http_504 · timeout · HTTP 504");
    expect(detail).toContain("Gateway Timeout (rota removida)");
    expect(auditDetail("uazapi.connection.updated", { tokenRotated: true, baseUrlChanged: false }))
      .toContain("token rotacionado: sim");
  });
});
