import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import type { Env } from "./env";

export interface AuthVariables {
  userId: string;
  userEmail: string;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function requireAuth(
  context: Context<{ Bindings: Env; Variables: AuthVariables }>,
  next: Next
): Promise<Response | void> {
  const authorization = context.req.header("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return context.json({ error: "unauthorized" }, 401);
  const token = authorization.slice(7);
  const baseUrl = context.env.SUPABASE_URL.replace(/\/$/, "");
  let keySet = keySets.get(baseUrl);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${baseUrl}/auth/v1/.well-known/jwks.json`));
    keySets.set(baseUrl, keySet);
  }
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: `${baseUrl}/auth/v1`,
      audience: "authenticated"
    });
    if (!payload.sub) throw new Error("missing_subject");
    context.set("userId", payload.sub);
    context.set("userEmail", typeof payload.email === "string" ? payload.email : "");
    await next();
  } catch {
    return context.json({ error: "unauthorized" }, 401);
  }
}

