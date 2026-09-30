import { expect, test, type Page } from "@playwright/test";

test("renders the login and persists the selected theme", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/glowdc/login");

  await expect(page).toHaveTitle("Maxio Hub · GlowDC");
  await expect(page.getByRole("heading", { name: "O sinal comercial, de ponta a ponta." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrar no workspace" })).toBeVisible();
  await expect(page.getByAltText("m.hub")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("keeps the login usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/glowdc/login");

  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar no Maxio Hub" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("navigates the authenticated operational shell with synthetic data", async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockDashboardApi(page);
  await page.goto("/glowdc/login");
  await page.getByLabel("E-mail").fill("qa@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar no Maxio Hub" }).click();

  await expect(page).toHaveURL(/\/glowdc\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Pulso da operação" })).toBeVisible();
  await expect(page.getByText("GlowDC", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Conexões ativas" }).getByText("01", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Leads" }).click();
  await expect(page.getByRole("heading", { name: "Leads reconhecidos" })).toBeVisible();
  await expect(page.getByText("Campanha sintética")).toBeVisible();

  await page.getByRole("button", { name: "Operação" }).click();
  await expect(page.getByRole("heading", { name: "Operação e entrega" })).toBeVisible();
  await expect(page.getByText("LeadSubmitted")).toBeVisible();

  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByRole("heading", { name: "Conectar uma origem" })).toBeVisible();
  await expect(page.getByText("Instância UAZAPI")).toBeVisible();
});

async function mockSupabaseAuth(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", exp: now + 3600, iat: now, role: "authenticated", sub: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid" })}.synthetic-signature`;

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      json: {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "synthetic-refresh-token",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "qa@example.invalid",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: "2026-09-30T03:00:00.000Z",
          updated_at: "2026-09-30T03:00:00.000Z"
        }
      }
    });
  });
}

async function mockDashboardApi(page: Page) {
  await page.route("https://app.maxio.com.br/glowdc/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const now = "2026-09-30T03:00:00.000Z";
    if (path.endsWith("/api/workspaces")) {
      return route.fulfill({ json: { data: [{ role: "admin", workspaces: { id: "workspace-demo", name: "GlowDC", slug: "glowdc" } }] } });
    }
    if (path.endsWith("/api/connections")) {
      return route.fulfill({ json: { data: [{ id: "connection-demo", label: "WhatsApp comercial", base_url: "https://synthetic.uazapi.com", status: "active", meta_mode: "observation", webhook_installed_at: now, last_tested_at: now }] } });
    }
    if (path.endsWith("/api/leads")) {
      return route.fulfill({ json: { data: [{ id: "lead-demo", status: "active", first_seen_at: now, last_seen_at: now, last_classification: "paid_complete", attributions: [{ source_id: "source-demo", headline: "Campanha sintética" }], conversion_events: [{ status: "observed", event_id: "event-demo" }] }] } });
    }
    if (path.endsWith("/api/operations")) {
      return route.fulfill({ json: { data: [{ id: "operation-demo", event_id: "event-demo", status: "observed", occurred_at: now, sent_at: null, last_error_code: null }] } });
    }
    return route.fulfill({ status: 404, json: { error: "synthetic_route_not_found" } });
  });
}
