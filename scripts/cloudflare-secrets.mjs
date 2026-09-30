import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(process.env.GLOWDC_ENV_PATH ?? resolve(root, "..", ".env"));
const values = parseEnv(readFileSync(envPath, "utf8"));
const names = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "CREDENTIAL_ENCRYPTION_KEY",
  "PAYLOAD_ENCRYPTION_KEY",
  "IDENTITY_HMAC_KEY"
];
const secrets = Object.fromEntries(names.map((name) => [name, values.get(name)]));

if (Object.values(secrets).some((value) => !value)) {
  console.error("Envio recusado: um ou mais segredos obrigatórios estão ausentes.");
  process.exit(2);
}

const wrangler = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const result = spawnSync(process.execPath, [wrangler, "secret", "bulk", "--name", "glowdc-integration-api"], {
  cwd: resolve(root, "workers", "api"),
  env: process.env,
  input: JSON.stringify(secrets),
  encoding: "utf8"
});

if (result.status !== 0) {
  console.error("Wrangler não conseguiu cadastrar os segredos; saída omitida por segurança.");
  process.exit(result.status ?? 1);
}

console.log(JSON.stringify({ uploaded: true, names }));

function parseEnv(input) {
  const entries = new Map();
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}
