const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./
];

export function assertAllowedProviderUrl(rawUrl: string, allowedConfig: string): URL {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:") throw new Error("provider_url_requires_https");
  if (host === "localhost" || host === "::1" || PRIVATE_V4.some((pattern) => pattern.test(host))) {
    throw new Error("provider_url_private_host");
  }
  const allowed = allowedConfig.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const accepted = allowed.some((entry) =>
    entry.startsWith(".") ? host.endsWith(entry) && host.length > entry.length : host === entry
  );
  if (!accepted) throw new Error("provider_url_host_not_allowed");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

const SENSITIVE_KEYS = /^(token|authorization|access_?token|api_?key|secret|password)$/i;

export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[max-depth]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      output[key] = SENSITIVE_KEYS.test(key) ? "[redacted]" : sanitizePayload(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return value.slice(0, 20_000);
  return value;
}

export function extractWebhookToken(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  for (const candidate of [root.token, root.Token, root.instanceToken, root.instance_token]) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return null;
}

