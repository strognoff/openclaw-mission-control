/**
 * Plugin configuration loader.
 *
 * The plugin manifest declares the JSON schema; we do runtime validation
 * here to give operators a clear error instead of mysterious NaNs.
 */

export interface PluginConfig {
  url: string;
  agentId: string;
  agentName: string;
  apiKey: string;
  heartbeatMs: number;
  queueSize: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  maxRetries: number;
  disablePlugin: boolean;
}

export const DEFAULT_CONFIG: PluginConfig = {
  url: "http://127.0.0.1:8787/v1/agents",
  agentId: "",
  agentName: "",
  apiKey: "",
  heartbeatMs: 30_000,
  queueSize: 500,
  connectTimeoutMs: 5_000,
  readTimeoutMs: 2_000,
  maxRetries: 3,
  disablePlugin: false,
};

function clampPositiveInt(value: unknown, fallback: number, max = 10 * 60_000): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  if (n < 0) return fallback;
  if (n > max) return max;
  return n;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Coerce the operator-supplied plugin config into the shape the sender needs. */
export function resolveConfig(raw: unknown): PluginConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    url: asString(r.url, DEFAULT_CONFIG.url),
    agentId: asString(r.agentId, ""),
    agentName: asString(r.agentName, ""),
    apiKey: asString(r.apiKey, ""),
    heartbeatMs: clampPositiveInt(r.heartbeatMs, DEFAULT_CONFIG.heartbeatMs, 5 * 60_000),
    queueSize: clampPositiveInt(r.queueSize, DEFAULT_CONFIG.queueSize, 50_000),
    connectTimeoutMs: clampPositiveInt(r.connectTimeoutMs, DEFAULT_CONFIG.connectTimeoutMs, 60_000),
    readTimeoutMs: clampPositiveInt(r.readTimeoutMs, DEFAULT_CONFIG.readTimeoutMs, 30_000),
    maxRetries: clampPositiveInt(r.maxRetries, DEFAULT_CONFIG.maxRetries, 10),
    disablePlugin: r.disablePlugin === true,
  };
}