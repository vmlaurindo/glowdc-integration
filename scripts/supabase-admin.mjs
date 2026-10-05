import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const mode = ["--inspect", "--inspect-lead-ingestion", "--inspect-uazapi-cleanup", "--delete-uazapi-cleanup", "--apply", "--apply-admin", "--apply-agendor", "--apply-uazapi", "--configure-auth", "--keys", "--write-env"].find((entry) => args.has(entry));
const operationalEnv = parseEnv(readFileSync(resolve(process.env.GLOWDC_ENV_PATH ?? "../.env"), "utf8"));
const projectUrl = process.env.SUPABASE_URL ?? operationalEnv.get("SUPABASE_URL");
const projectRef = process.env.SUPABASE_PROJECT_REF ?? deriveProjectRef(projectUrl);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.GLOWDC_SUPABASE_ACCESS_TOKEN ??
  operationalEnv.get("SUPABASE_ACCESS_TOKEN") ?? operationalEnv.get("GLOWDC_SUPABASE_ACCESS_TOKEN");
const expectedName = process.env.SUPABASE_EXPECTED_PROJECT_NAME ?? operationalEnv.get("SUPABASE_EXPECTED_PROJECT_NAME") ?? "Glow DC";
const apiBase = "https://api.supabase.com/v1";

if (!mode || !projectRef || !accessToken) {
  console.error("Uso: SUPABASE_ACCESS_TOKEN + --inspect|--inspect-lead-ingestion|--inspect-uazapi-cleanup|--delete-uazapi-cleanup|--apply|--apply-admin|--apply-agendor|--apply-uazapi|--configure-auth|--keys|--write-env");
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

if (mode === "--inspect-lead-ingestion") {
  const counts = await query(`
    select json_build_object(
      'webhook_events', (select count(*)::int from public.webhook_events),
      'leads', (select count(*)::int from public.leads),
      'attributions', (select count(*)::int from public.attributions),
      'conversion_events', (select count(*)::int from public.conversion_events)
    ) as counts;
  `);
  console.log(JSON.stringify({ project: { id: project.id, name: project.name }, ingestion: counts[0]?.counts ?? null }));
}

if (mode === "--inspect-uazapi-cleanup") {
  const connections = await query(`
    select c.id, c.label, c.status,
      (select count(*)::int from public.webhook_events e where e.connection_id = c.id) as webhook_events,
      (select count(*)::int from public.attributions a where a.connection_id = c.id) as attributions,
      (select count(*)::int from public.conversion_events v join public.attributions a on a.id = v.attribution_id where a.connection_id = c.id) as conversions
    from public.provider_connections c
    join public.workspaces w on w.id = c.workspace_id
    where w.slug = 'glowdc' and c.provider = 'uazapi'
      and c.label in ('Glow Lab Dental', 'Laboratório Glow')
    order by c.label;
  `);
  console.log(JSON.stringify({ project: { id: project.id, name: project.name }, connections }));
}

if (mode === "--delete-uazapi-cleanup") {
  const result = await query(`
    with targets as (
      select c.id
      from public.provider_connections c
      join public.workspaces w on w.id = c.workspace_id
      where w.slug = 'glowdc' and c.provider = 'uazapi'
        and ((c.id = '70455af1-4f13-4052-a3af-edc7e73583bf'::uuid and c.label = 'Glow Lab Dental')
          or (c.id = 'df89e448-c04f-4df0-a9c2-b9f3738a3e88'::uuid and c.label = 'Laboratório Glow'))
        and not exists (select 1 from public.webhook_events e where e.connection_id = c.id)
        and not exists (select 1 from public.attributions a where a.connection_id = c.id)
    ), ready as (
      select array_agg(id) as ids from targets having count(*) = 2
    ), removed as (
      delete from public.provider_connections c using ready r
      where c.id = any(r.ids) returning c.id
    )
    select count(*)::int as removed from removed;
  `);
  const removed = Number(result[0]?.removed ?? 0);
  if (removed !== 2) {
    console.error("Remoção recusada: os dois registros exatos não estavam presentes ou algum possui dados dependentes.");
    process.exit(2);
  }
  const remaining = await query(`
    select count(*)::int as count
    from public.provider_connections
    where id = any(array['70455af1-4f13-4052-a3af-edc7e73583bf', 'df89e448-c04f-4df0-a9c2-b9f3738a3e88']::uuid[]);
  `);
  if (Number(remaining[0]?.count ?? -1) !== 0) {
    console.error("Remoção executada, mas a verificação dos registros restantes falhou.");
    process.exit(1);
  }
  console.log(JSON.stringify({ removed, verifiedRemaining: 0, project: { id: project.id, name: project.name } }));
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

if (mode === "--apply-admin") {
  const migrationPath = resolve("supabase/migrations/202609300001_admin_control_plane.sql");
  const sql = readFileSync(migrationPath, "utf8");
  if (!sql.includes("CREATE TABLE IF NOT EXISTS public.platform_admins") ||
      !sql.includes("admin_update_workspace_name") ||
      /\b(?:DROP\s+TABLE|TRUNCATE)\b/i.test(sql)) {
    console.error("Aplicação recusada: a migração administrativa não passou pela política aditiva.");
    process.exit(2);
  }
  await query(sql);
  const verification = await query(`
    select
      (select count(*)::int from information_schema.tables
       where table_schema = 'public' and table_name = 'platform_admins') as admin_table,
      (select count(*)::int from information_schema.columns
       where table_schema = 'public' and table_name = 'workspaces' and column_name = 'updated_at') as workspace_updated_at,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (
         'admin_find_auth_user_by_email',
         'admin_update_workspace_name','admin_add_workspace_member',
         'admin_set_member_role','admin_revoke_workspace_member'
       )) as admin_functions,
      (select count(*)::int from storage.buckets where id = 'profile-photos' and not public) as private_photo_bucket,
      (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'profile_photos_%') as photo_policies;
  `);
  const result = verification[0] ?? {};
  const valid = Number(result.admin_table) === 1 && Number(result.workspace_updated_at) === 1 &&
      Number(result.admin_functions) === 5 && Number(result.private_photo_bucket) === 1 &&
    Number(result.photo_policies) === 4;
  if (!valid) {
    console.error("Migração aplicada, mas a verificação estrutural não atingiu os critérios esperados.");
    process.exit(1);
  }
  console.log(JSON.stringify({
    applied: true,
    project: { id: project.id, name: project.name },
    migration: "202609300001_admin_control_plane.sql",
    sha256: createHash("sha256").update(sql).digest("hex"),
    verification: result
  }));
}

if (mode === "--apply-agendor") {
  const migrationPaths = [
    resolve("supabase/migrations/202610010001_agendor_integrations.sql"),
    resolve("supabase/migrations/202610010002_agendor_pipeline.sql")
  ];
  const sql = migrationPaths.map((path) => readFileSync(path, "utf8")).join("\n");
  const requiredTables = [
    "agendor_integrations", "agendor_contact_links", "agendor_deals",
    "agendor_movements", "agendor_sync_cursors", "integration_jobs",
    "commercial_conversion_rules"
  ];
  if (!requiredTables.every((table) => sql.includes(`public.${table}`)) || /\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
    console.error("Aplicação recusada: as migrações Agendor não passaram pela política aditiva.");
    process.exit(2);
  }
  await query(sql);
  const verification = await query(`
    select count(*)::int as tables
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(array[${requiredTables.map((name) => `'${name}'`).join(",")}]);
  `);
  const tableCount = Number(verification[0]?.tables ?? 0);
  if (tableCount !== requiredTables.length) {
    console.error("Migrações Agendor aplicadas, mas a verificação estrutural falhou.");
    process.exit(1);
  }
  console.log(JSON.stringify({
    applied: true,
    project: { id: project.id, name: project.name },
    migrations: migrationPaths.map((path) => path.split(/[\\/]/).pop()),
    verification: { tables: tableCount }
  }));
}

if (mode === "--apply-uazapi") {
  const migrationPath = resolve("supabase/migrations/202610020001_uazapi_connection_diagnostics.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const requiredChanges = [
    /ADD COLUMN IF NOT EXISTS last_error_summary text/i,
    /ADD COLUMN IF NOT EXISTS suspended_at timestamptz/i
  ];
  if (!requiredChanges.every((pattern) => pattern.test(sql)) || /\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
    console.error("AplicaÃ§Ã£o recusada: a migraÃ§Ã£o UAZAPI nÃ£o passou pela polÃ­tica aditiva.");
    process.exit(2);
  }
  await query(sql);
  const verification = await query(`
    select count(*)::int as columns
    from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_connections'
      and column_name = any(array['last_error_summary', 'suspended_at']);
  `);
  const columnCount = Number(verification[0]?.columns ?? 0);
  if (columnCount !== requiredChanges.length) {
    console.error("MigraÃ§Ã£o UAZAPI aplicada, mas a verificaÃ§Ã£o estrutural falhou.");
    process.exit(1);
  }
  console.log(JSON.stringify({
    applied: true,
    project: { id: project.id, name: project.name },
    migration: "202610020001_uazapi_connection_diagnostics.sql",
    sha256: createHash("sha256").update(sql).digest("hex"),
    verification: { columns: columnCount }
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

function deriveProjectRef(value) {
  try {
    const host = new URL(String(value)).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
  } catch {
    return "";
  }
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
