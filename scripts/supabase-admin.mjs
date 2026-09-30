import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const mode = ["--inspect", "--apply", "--configure-auth", "--keys", "--write-env"].find((entry) => args.has(entry));
const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const expectedName = process.env.SUPABASE_EXPECTED_PROJECT_NAME ?? "Glow DC";
const apiBase = "https://api.supabase.com/v1";

if (!mode || !projectRef || !accessToken) {
  console.error("Uso: SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN + --inspect|--apply|--configure-auth|--keys|--write-env");
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

if (mode === "--keys" || mode === "--write-env") {
  const keys = await adminJson(
    `${apiBase}/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`
  );
  const publishable = findApiKey(keys, "publishable");
  const secret = findApiKey(keys, "secret");

  if (mode === "--keys") {
    console.log(JSON.stringify({
      project: { id: project.id, name: project.name },
      keys: {
        publishable: Boolean(publishable),
        secret: Boolean(secret)
      }
    }));
  } else {
    const envPath = process.env.SUPABASE_ENV_PATH;
    if (!envPath || !publishable || !secret) {
      console.error("Escrita recusada: caminho do .env ou chaves modernas do projeto ausentes.");
      process.exit(2);
    }
    const absoluteEnvPath = resolve(envPath);
    const current = readFileSync(absoluteEnvPath, "utf8");
    const existing = parseEnv(current);
    const internalKeyNames = [
      "CREDENTIAL_ENCRYPTION_KEY",
      "PAYLOAD_ENCRYPTION_KEY",
      "IDENTITY_HMAC_KEY"
    ];
    const generated = [];
    const internalKeys = Object.fromEntries(internalKeyNames.map((name) => {
      const currentValue = existing.get(name);
      if (isBase64Key(currentValue, 32)) return [name, currentValue];
      generated.push(name);
      return [name, randomBytes(32).toString("base64")];
    }));
    const managedNames = new Set([
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      ...internalKeyNames
    ]);
    const retained = current
      .split(/\r?\n/)
      .filter((line) => {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        return !match || !managedNames.has(match[1]);
      })
      .join("\n")
      .replace(/\s+$/, "");
    const managedSection = [
      "# Supabase: chaves emitidas pelo projeto Glow DC; não são segredos aleatórios locais.",
      `SUPABASE_PUBLISHABLE_KEY=${apiKeyValue(publishable)}`,
      `VITE_SUPABASE_PUBLISHABLE_KEY=${apiKeyValue(publishable)}`,
      `SUPABASE_SECRET_KEY=${apiKeyValue(secret)}`,
      "",
      "# Criptografia interna: segredos independentes de 32 bytes codificados em base64.",
      "# Não reutilize entre finalidades. A rotação exige procedimento de migração dos dados cifrados.",
      ...internalKeyNames.map((name) => `${name}=${internalKeys[name]}`)
    ].join("\n");
    writeFileSync(absoluteEnvPath, `${retained}\n\n${managedSection}\n`, { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify({
      written: true,
      project: { id: project.id, name: project.name },
      variables: [
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
        ...internalKeyNames
      ],
      generatedInternalKeys: generated
    }));
  }
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

function findApiKey(keys, type) {
  if (!Array.isArray(keys)) return null;
  return keys.find((entry) => entry?.type === type && apiKeyValue(entry)) ?? null;
}

function apiKeyValue(entry) {
  return String(entry?.api_key ?? entry?.key ?? "");
}

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function isBase64Key(value, byteLength) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, "base64").length === byteLength;
  } catch {
    return false;
  }
}
