import { expect, test } from "@playwright/test";

test("validates the local administrative journey with synthetic data", async ({ page }) => {
  const errors: string[] = [];
  const externalApiCalls: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.includes("supabase") || (url.hostname === "app.maxio.com.br" && url.pathname.includes("/glowdc/api"))) externalApiCalls.push(url.toString());
  });

  await page.goto("/glowdc/dashboard?mock-admin=1");
  await expect(page.getByRole("heading", { name: "Pulso da operação" })).toBeVisible();
  await expect(page.getByText("Dados de demonstração")).toBeVisible();
  await expect(page.getByText("GlowDC", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Administração" })).toHaveCount(0);

  await page.getByRole("button", { name: "Abrir menu da conta" }).click();
  await expect(page.getByRole("menuitem", { name: /Conta/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Administração/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /Conta/ }).click();
  await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
  await page.getByLabel("Nome").fill("Pessoa de demonstração");
  await page.locator('input[type="file"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("synthetic-image") });
  await expect(page.getByAltText("Foto da conta")).toBeVisible();
  await page.getByRole("button", { name: "Salvar dados pessoais" }).click();
  await expect(page.getByText("Dados da conta atualizados.")).toBeVisible();
  await page.getByLabel("Senha atual").fill("senha-atual-sintetica");
  await page.getByLabel("Nova senha", { exact: true }).fill("nova-senha-sintetica-2026");
  await page.getByLabel("Confirmar nova senha").fill("nova-senha-sintetica-2026");
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(page.getByText("Senha atualizada.")).toBeVisible();

  await page.getByRole("button", { name: "Abrir menu da conta" }).click();
  await expect(page.getByRole("menu").getByText("Pessoa de demonstração", { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: /Administração/ }).click();
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspaces da agência" })).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome").fill("Glow DC Brasil");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Nome do workspace atualizado.")).toBeVisible();
  await expect(page.getByText("Glow DC Brasil", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Equipe/ }).click();
  await expect(page.getByRole("heading", { name: "Equipe do workspace" })).toBeVisible();
  await expect(page.getByRole("row", { name: /admin@maxio.example/ })).toBeVisible();
  await expect(page.locator(".admin-table td").first()).toHaveCSS("display", "table-cell");
  await page.getByRole("button", { name: "Convidar integrante" }).click();
  await page.getByLabel("E-mail").fill("nova.pessoa@exemplo.test");
  await page.locator(".team-editor").getByRole("combobox").selectOption("viewer");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("nova.pessoa@exemplo.test")).toBeVisible();
  await expect(page.getByText("Convite preparado para o integrante.")).toBeVisible();

  await page.getByRole("button", { name: /Auditoria/ }).click();
  await expect(page.getByRole("heading", { name: "Log de alterações" })).toBeVisible();
  await expect(page.locator(".audit-list").getByText("Glow DC Brasil", { exact: true })).toBeVisible();
  await expect(page.locator(".audit-list").getByText("nova.pessoa@exemplo.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Nome alterado de GlowDC para Glow DC Brasil")).toBeVisible();

  expect(externalApiCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("keeps the administrative mock usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/glowdc/dashboard?mock-admin=1");
  await page.getByRole("button", { name: "Abrir menu da conta" }).click();
  await expect(page.getByRole("menuitem", { name: /Conta/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /Administração/ }).click();
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Equipe/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Auditoria/ })).toBeVisible();
  expect(await page.evaluate(() => {
    window.scrollTo(10_000, 0);
    return window.scrollX;
  })).toBe(0);
  await expect(page.getByRole("row", { name: /GlowDC/ })).toBeVisible();
});
