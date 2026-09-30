import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(process.env.GLOWDC_ENV_PATH ?? resolve(root, "..", ".env"));
const values = parseEnv(readFileSync(envPath, "utf8"));
const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? values.get("CF_API_TOKEN");
const assetsIndex = resolve(root, "apps", "web", "dist", "index.html");
const wrangler = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const config = resolve(root, "workers", "api", "wrangler.toml");

if (!existsSync(assetsIndex) || !existsSync(wrangler) || !existsSync(config)) {
  console.error("Deploy recusado: build do frontend ou configuração do Worker ausente.");
  process.exit(2);
}

const result = spawnSync(process.execPath, [wrangler, "deploy", "--config", config], {
  cwd: resolve(root, "workers", "api"),
  env: {
    ...process.env
  },
  stdio: "inherit"
});

if (result.error || result.status !== 0) {
  console.error("Deploy Cloudflare não concluído; confira a autenticação e as permissões do token.");
  process.exit(result.status ?? 1);
}
console.log("Worker e bundle web publicados no ambiente live.");

function parseEnv(source) {
  const entries = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}
