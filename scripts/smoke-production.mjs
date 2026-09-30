import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.env.GLOWDC_ENV_PATH ?? "../.env");
const values = parseEnv(readFileSync(envPath, "utf8"));
const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ADMIN_EMAIL",
  "SUPABASE_ADMIN_PASSWORD"
];
if (required.some((name) => !values.get(name))) fail("Smoke recusado: configuração ausente.");

const supabase = createClient(
  values.get("SUPABASE_URL"),
  values.get("SUPABASE_PUBLISHABLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data, error } = await supabase.auth.signInWithPassword({
  email: values.get("SUPABASE_ADMIN_EMAIL"),
  password: values.get("SUPABASE_ADMIN_PASSWORD")
});
if (error || !data.session?.access_token) fail("Smoke falhou na autenticação.");

const baseUrl = "https://app.maxio.com.br/glowdc";
const healthResponse = await fetch(`${baseUrl}/health`);
const health = await healthResponse.json().catch(() => null);
if (!healthResponse.ok || health?.status !== "ok") fail("Smoke falhou no health check.");

const workspaceResponse = await fetch(`${baseUrl}/api/workspaces`, {
  headers: { Authorization: `Bearer ${data.session.access_token}` }
});
const workspacePayload = await workspaceResponse.json().catch(() => null);
const membership = workspacePayload?.data?.find((entry) => entry?.workspaces?.slug === "glowdc");
if (!workspaceResponse.ok || membership?.role !== "owner") {
  fail("Smoke falhou no acesso ao workspace.");
}

await supabase.auth.signOut({ scope: "local" });
console.log(JSON.stringify({
  passed: true,
  health: true,
  authentication: true,
  workspace: "glowdc",
  effectiveRole: "owner"
}));

function parseEnv(input) {
  const entries = new Map();
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
