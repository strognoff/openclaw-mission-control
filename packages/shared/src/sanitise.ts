/**
 * OpenClaw Mission Control — sanitisation utility.
 *
 * Drop-in for the plugin's pre-send layer. Built once, used by every
 * transport, and exhaustively unit-tested.
 *
 * Policy:
 *  - Whitelist: activity, task, tool, runId, sessionId, type, status,
 *    timestamp, progressCurrent/Total/Percent, progressLabel, agentId,
 *    agentName, host, platform, openclawVersion.
 *  - String whitelist fields are truncated to <=200 chars.
 *  - Numeric whitelist fields are passed through if finite.
 *  - Anything else inside an object (or any nested object whose key matches a
 *    sensitive pattern) is replaced with "[redacted]".
 *  - Strings that match sensitive patterns in their content get the whole
 *    field dropped to "[redacted]".
 *
 * Important: this function NEVER throws. A plugin failure here is worse than
 * dropping a field.
 */

const STRING_FIELD_MAX = 200;

export const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /prompt/i,
  /response/i,
  /authorization/i,
  /cookie/i,
  /token/i,
  /password/i,
  /secret/i,
  /\bkey\b/i,
  /output/i,
  /^env$/i,
  /body/i,
  /headers?$/i,
];

export const ALLOWED_STRING_FIELDS = new Set<string>([
  "activity",
  "task",
  "tool",
  "runId",
  "sessionId",
  "type",
  "status",
  "timestamp",
  "agentId",
  "agentName",
  "host",
  "hostname",
  "platform",
  "openclawVersion",
  "progressLabel",
]);

export const ALLOWED_NUMERIC_FIELDS = new Set<string>([
  "progressCurrent",
  "progressTotal",
  "progressPercent",
]);

/** Patterns inside string content that should nuke the field. */
const SENSITIVE_CONTENT_HINTS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/, // OpenAI / generic
  /gh[pousr]_[A-Za-z0-9]{16,}/, // GitHub tokens
  /xox[bpars]-[A-Za-z0-9-]{8,}/, // Slack tokens
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/i,
  /Authorization:\s*[A-Za-z0-9._-]{8,}/i,
  /password\s*[:=]\s*\S+/i,
  /cookie\s*[:=]\s*\S+/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function keyIsSensitive(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

function truncate(s: string, max = STRING_FIELD_MAX): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function looksLikeSecret(value: string): boolean {
  return SENSITIVE_CONTENT_HINTS.some((re) => re.test(value));
}

/**
 * Recursively sanitise an arbitrary payload. Returns a structurally-similar
 * object with sensitive content removed. Never throws.
 */
export function sanitise<T = unknown>(input: T): T {
  return walk(input, new WeakSet<object>()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string") {
    const s = value as string;
    return looksLikeSecret(s) ? "[redacted]" : s;
  }
  if (t === "number") {
    return Number.isFinite(value as number) ? (value as number) : "[redacted]";
  }
  if (t === "boolean") return value;
  if (t === "bigint" || t === "symbol" || t === "function") {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[redacted]";
    seen.add(value);
    return value.map((item) => walk(item, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return "[redacted]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (keyIsSensitive(k)) {
        out[k] = "[redacted]";
        continue;
      }
      if (ALLOWED_STRING_FIELDS.has(k)) {
        if (typeof v === "string") {
          out[k] = looksLikeSecret(v) ? "[redacted]" : truncate(v);
        } else if (v === null || v === undefined) {
          out[k] = v;
        } else if (typeof v === "number" && ALLOWED_NUMERIC_FIELDS.has(k)) {
          out[k] = Number.isFinite(v) ? v : "[redacted]";
        } else {
          // Wrong type for an allowed field — still strip aggressively.
          out[k] = "[redacted]";
        }
        continue;
      }
      if (ALLOWED_NUMERIC_FIELDS.has(k)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          out[k] = v;
        } else if (v === null || v === undefined) {
          out[k] = v;
        } else {
          out[k] = "[redacted]";
        }
        continue;
      }
      // Generic case: recurse so nested objects/arrays still get cleaned,
      // but redacted keys short-circuit.
      if (typeof v === "string") {
        out[k] = looksLikeSecret(v) ? "[redacted]" : truncate(v);
      } else if (v !== null && typeof v === "object") {
        out[k] = walk(v, seen);
      } else if (typeof v === "number") {
        out[k] = Number.isFinite(v) ? v : "[redacted]";
      } else if (typeof v === "boolean") {
        out[k] = v;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  return "[redacted]";
}

/**
 * Convenience: sanitise a McEventPayload, dropping anything not on the
 * whitelist. The plugin uses this just before it puts an event on the wire.
 */
export function sanitiseEvent<T extends Record<string, unknown>>(input: T): T {
  return sanitise(input);
}