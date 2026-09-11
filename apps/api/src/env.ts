/**
 * Centralised env loader + validators.
 *
 * The API uses process.env. Failures here are loud and immediate so an
 * operator never sees a half-configured server.
 */

import { z } from "zod";

const schema = z.object({
  MC_HOST: z.string().default("0.0.0.0"),
  MC_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MC_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MC_ADMIN_KEY: z
    .string()
    .min(16, "MC_ADMIN_KEY must be at least 16 chars; generate with `openssl rand -hex 32`"),
  MC_DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  MC_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  MC_RETENTION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(24 * 60 * 60 * 1000)
    .default(60 * 60 * 1000),
  MC_RETENTION_LOCKFILE: z
    .string()
    .default("/tmp/menuboard-agents-api.retention.lock"),
  MC_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(100).max(600_000).default(30_000),
  /**
   * Cadence at which a heartbeat event row is emitted for an idle agent
   * (one whose status/task/activity/tool did not change). Without this,
   * the LAST BEAT card advances but the Live Activity feed stays empty
   * (issue #4). Must be >= MC_HEARTBEAT_INTERVAL_MS.
   */
  MC_HEARTBEAT_EVENT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(3_600_000)
    .default(60_000),
  MC_OFFLINE_AFTER_MS: z.coerce.number().int().min(100).max(3_600_000).default(90_000),
  MC_REAPER_INTERVAL_MS: z.coerce.number().int().min(50).max(600_000).default(10_000),
  MC_CORS_ORIGINS: z.string().default("*"),
  MC_PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:8787/v1/agents"),
});

export type AppEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** Parse the CORS origins string into an array. `"*"` returns `["*"]`. */
export function parseCorsOrigins(value: string): string[] | "*" {
  if (value.trim() === "*") return "*";
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}