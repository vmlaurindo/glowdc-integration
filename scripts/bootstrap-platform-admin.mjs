import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.env.GLOWDC_ENV_PATH ?? "../.env");
const values = parseEnv(readFileSync(envPath, "utf8"));
const supabaseUrl = values.get("SUPABASE_URL");
const secretKey = values.get("SUPABASE_SECRET_KEY");
const adminEmail = values.get("SUPABASE_ADMIN_EMAIL")?.trim().toLowerCase();

if (!supabaseUrl || !secretKey || !adminEmail) {
  console.error("Bootstrap recusado: configuração do projeto ou conta administrativa ausente.");
  process.exit(2);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) fail("Não foi possível consultar as contas Auth.");
const user = listed.users.find((entry) => entry.email?.toLowerCase() === adminEmail);
if (!user) fail("A conta administrativa configurada não existe no Supabase Auth; nenhuma conta foi criada.");

const { data: existing, error: lookupError } = await supabase
  .from("platform_admins")
  .select("user_id")
  .eq("user_id", user.id)
  .maybeSingle();
if (lookupError) fail("Não foi possível verificar a associação administrativa.");

if (!existing) {
  const { error: insertError } = await supabase.from("platform_admins").insert({
    user_id: user.id,
    created_by: user.id
  });
  if (insertError) fail("Não foi possível associar a conta como administradora da plataforma.");
}

console.log(JSON.stringify({ configured: true, platformAdmin: true, changed: !existing }));

function parseEnv(source) {
  const entries = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
