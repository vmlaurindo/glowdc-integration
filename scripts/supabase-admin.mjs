import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const mode = ["--inspect", "--apply", "--configure-auth"].find((entry) => args.has(entry));
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const expectedName = process.env.SUPABASE_EXPECTED_PROJECT_NAME ?? "Glow DC";
const apiBase = "https://api.supabase.com/v1";

if (!mode || !projectRef || !accessToken) {
  console.error("Uso: SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN + --inspect|--apply|--configure-auth");
  process.exit(2);
}

const project = await adminJson(`${apiBase}/projects/${encodeURIComponent(projectRef)}`);
if (project.id !== projectRef || normalize(project.name) !== normalize(expectedName)) {
  console.error("Projeto recusado: referência ou nome não corresponde ao alvo esperado.");
  process.exit(2);
}

if (mode === "--inspect") {
  const rows = await query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname;
  `);
  const unsafeGrants = await query(`
    select count(*)::int as count
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_workspace','ingest_whatsapp_event','get_meta_delivery_context')
      and grantee in ('PUBLIC','anon','authenticated');
  `);
  console.log(JSON.stringify({
    project: { id: project.id, name: project.name, region: project.region, status: project.status },
    publicTables: rows,
    unsafeFunctionGrants: Number(unsafeGrants[0]?.count ?? -1)
  }));
}

if (mode === "--apply") {
  const migrationPath = resolve("supabase/migrations/202609290001_initial.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const targetTables = [
    "workspaces", "workspace_members", "provider_connections", "contacts", "leads",
    "webhook_events", "attributions", "meta_destinations", "conversion_events", "audit_logs"
  ];
  const existing = await query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(array[${targetTables.map((name) => `'${name}'`).join(",")}]);
  `);
  if (existing.length) {
    console.error("Aplicação recusada: uma ou mais tabelas-alvo já existem.");
    process.exit(2);
  }
  if (!sql.includes("CREATE TABLE public.workspaces") || /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
    console.error("Aplicação recusada: a migração não passou pela política aditiva.");
    process.exit(2);
  }
  await query(sql);
  const verification = await query(`
    select
      (select count(*)::int from information_schema.tables
       where table_schema = 'public' and table_name = any(array[${targetTables.map((name) => `'${name}'`).join(",")}])) as tables,
      (select count(*)::int from pg_policies
       where schemaname = 'public' and tablename = any(array[${targetTables.map((name) => `'${name}'`).join(",")}])) as policies,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relrowsecurity
         and c.relname = any(array[${targetTables.map((name) => `'${name}'`).join(",")}])) as rls_enabled,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('create_workspace','ingest_whatsapp_event','get_meta_delivery_context')) as functions;
  `);
  console.log(JSON.stringify({
    applied: true,
    project: { id: project.id, name: project.name },
    migration: "202609290001_initial.sql",
    sha256: createHash("sha256").update(sql).digest("hex"),
    verification: verification[0]
  }));
}

if (mode === "--configure-auth") {
  const siteUrl = "https://app.maxio.com.br/glowdc/login";
  const allowList = [siteUrl, "http://localhost:5173/glowdc/login"].join(",");
  await adminJson(`${apiBase}/projects/${encodeURIComponent(projectRef)}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({ site_url: siteUrl, uri_allow_list: allowList, disable_signup: true })
  });
  const config = await adminJson(`${apiBase}/projects/${encodeURIComponent(projectRef)}/config/auth`);
  console.log(JSON.stringify({
    configured: true,
    project: { id: project.id, name: project.name },
    auth: {
      site_url: config.site_url,
      disable_signup: config.disable_signup,
      redirectConfigured: String(config.uri_allow_list ?? "").includes("/glowdc/login")
    }
  }));
}

async function query(sql) {
  return adminJson(`${apiBase}/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql })
  });
}

async function adminJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  if (!response.ok) {
    console.error(`Supabase Management API falhou com HTTP ${response.status}; resposta administrativa omitida.`);
    process.exit(1);
  }
  return response.json();
}

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
