/**
 * Dual-tier authentication.
 *
 * Two parallel credential stores live behind the same `Authorization: Bearer`
 * header:
 *   1. **Agent keys** — bcrypt-hashed; each is bound to one Agent row.
 *      Used by the bot endpoints (POST /v1/agents/events, /heartbeat,
 *      /register).
 *   2. **Admin key** — single env value (MC_ADMIN_KEY); used for the
 *      dashboard reads + the key-management endpoints.
 *
 * The API resolves the bearer once per request and stuffs the resolved
 * identity onto `request.auth`. Handlers can branch on `auth.kind`.
 */

import bcrypt from "bcrypt";
import type { FastifyRequest } from "fastify";
import { getPrisma } from "./db.js";
import type { ApiKey, Agent } from "@prisma/client";

export type AuthIdentity =
  | { kind: "admin" }
  | { kind: "agent"; agent: Agent; apiKey: ApiKey };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthIdentity;
  }
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract a bearer token from the Authorization header or `?token=` query. */
export function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (m) return m[1]!.trim();
  }
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

/**
 * Try to authenticate an incoming request.
 *
 * Resolution order:
 *   1. If the bearer matches the admin key → admin identity.
 *   2. Otherwise, look up the first 8 chars (keyPrefix) of the bearer in
 *      ApiKey, then bcrypt-verify the full key. This is two-phase so a
 *      stolen prefix narrows the search but isn't itself a credential.
 *
 * Returns null when no valid identity could be resolved.
 */
export async function authenticate(
  bearer: string | null,
  adminKey: string,
): Promise<AuthIdentity | null> {
  if (!bearer) return null;
  if (safeEqual(bearer, adminKey)) return { kind: "admin" };

  // Agent key: we use the first 8 chars as a coarse lookup index.
  if (bearer.length < 16) return null;
  const prefix = bearer.slice(0, 8);
  const candidates = await getPrisma().apiKey.findMany({
    where: { keyPrefix: prefix, revokedAt: null },
    include: { agent: true },
  });
  for (const candidate of candidates) {
    // bcrypt.compare is constant-time-ish and slow on purpose.
    const ok = await bcrypt.compare(bearer, candidate.keyHash);
    if (ok) {
      // Touch lastUsedAt fire-and-forget — never block the request on this.
      void getPrisma()
        .apiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {});
      return { kind: "agent", agent: candidate.agent, apiKey: candidate };
    }
  }
  return null;
}

/** Hash an agent API key for storage. */
export async function hashKey(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10);
}

/** Generate a fresh 32-byte random key. Returned as `mc_<48 base64url>`. */
export function generateApiKey(): string {
  const buf = new Uint8Array(36);
  crypto.getRandomValues(buf);
  const b64 = Buffer.from(buf).toString("base64url");
  return `mc_${b64}`;
}