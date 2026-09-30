import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    screenshot: "off",
    trace: "off"
  },
  webServer: {
    command: "npm run dev --workspace @glowdc/web -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/glowdc/login",
    reuseExistingServer: true,
    timeout: 30_000
  }
});
