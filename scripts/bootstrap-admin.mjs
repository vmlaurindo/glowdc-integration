import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.env.GLOWDC_ENV_PATH ?? "../.env");
const source = readFileSync(envPath, "utf8");
const values = parseEnv(source);
const email = process.env.GLOWDC_ADMIN_EMAIL ?? "victor@maxio.com.br";
const existingPassword = values.get("SUPABASE_ADMIN_PASSWORD");
const password = /^[0-9a-f]{12}$/.test(existingPassword ?? "")
  ? existingPassword
  : randomBytes(6).toString("hex");
const supabaseUrl = values.get("SUPABASE_URL");
const secretKey = values.get("SUPABASE_SECRET_KEY");

if (!supabaseUrl || !secretKey) {
  console.error("Bootstrap recusado: configuração Supabase ausente.");
  process.exit(2);
}

writeManagedEnv(envPath, source, {
  SUPABASE_ADMIN_EMAIL: email,
  SUPABASE_ADMIN_PASSWORD: password
});

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) fail("Não foi possível consultar usuários Auth.");
let user = listed.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
let userCreated = false;

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: "admin" }
  });
  if (error || !data.user) fail("Não foi possível criar o usuário Auth.");
  user = data.user;
  userCreated = true;
}

const { data: memberships, error: membershipError } = await supabase
  .from("workspace_members")
  .select("workspace_id,role")
  .eq("user_id", user.id)
  .limit(1);
if (membershipError) fail("Não foi possível consultar o acesso ao workspace.");

let workspaceCreated = false;
if (!memberships?.length) {
  const { error } = await supabase.rpc("create_workspace", {
    p_name: "Glow DC",
    p_slug: "glowdc",
    p_owner_id: user.id
  });
  if (error) fail("Não foi possível criar o workspace inicial.");
  workspaceCreated = true;
}

console.log(JSON.stringify({
  configured: true,
  passwordStored: true,
  userCreated,
  workspaceCreated,
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

function writeManagedEnv(target, current, managed) {
  const names = new Set(Object.keys(managed));
  const retained = current.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !match || !names.has(match[1]);
  }).join("\n").replace(/\s+$/, "");
  const section = [
    "# Acesso administrativo inicial. Senha aleatória com 12 caracteres hexadecimais.",
    ...Object.entries(managed).map(([name, value]) => `${name}=${value}`)
  ].join("\n");
  writeFileSync(target, `${retained}\n\n${section}\n`, { encoding: "utf8", mode: 0o600 });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
