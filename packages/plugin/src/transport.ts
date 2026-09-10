/**
 * HTTP transport for Mission Control ingestion.
 *
 * - Uses Node's global fetch (no extra deps).
 * - Hard 5s connect timeout, 2s read timeout via AbortSignal.
 * - Bounded retries (default 3) with exponential backoff + ±500ms jitter.
 * - Never throws. Any unexpected error returns a typed result.
 *
 * Why no undici: Node 24 ships a global fetch with built-in AbortSignal
 * support, and the spec asks for no extra HTTP deps.
 */

export interface TransportOptions {
  url: string;
  apiKey: string;
  body: unknown;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  maxRetries: number;
  /** Hook for the sender to count its own failures. */
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

export type TransportResult =
  | { ok: true; status: number }
  | { ok: false; reason: "aborted" | "timeout" | "network" | "http"; status?: number; message: string };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function jitter(base: number): number {
  // ±500ms uniform
  return base + (Math.random() * 1000 - 500);
}

/**
 * Post `body` as JSON to `url` with the given options.
 * Returns a TransportResult; never throws.
 */
export async function postJson(opts: TransportOptions): Promise<TransportResult> {
  const {
    url,
    apiKey,
    body,
    connectTimeoutMs,
    readTimeoutMs,
    maxRetries,
    onRetry,
  } = opts;

  const json = (() => {
    try {
      return JSON.stringify(body);
    } catch (err) {
      return {
        ok: false as const,
        reason: "network" as const,
        message: `serialize failed: ${(err as Error).message}`,
      };
    }
  })();
  if (typeof json !== "string") return json;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "openclaw-mission-control/0.1 (+plugin)",
  };
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;

  let lastErr: TransportResult | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const base = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      const delay = Math.max(50, jitter(base));
      onRetry?.(attempt, delay, lastErr?.reason ?? "unknown");
      try {
        await sleep(delay);
      } catch {
        return {
          ok: false,
          reason: "aborted",
          message: "transport aborted during backoff",
        };
      }
    }

    const ac = new AbortController();
    const connectTimer = setTimeout(() => ac.abort("connect-timeout"), connectTimeoutMs);
    const readTimer = setTimeout(() => ac.abort("read-timeout"), connectTimeoutMs + readTimeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: json,
        signal: ac.signal,
      });
      clearTimeout(connectTimer);
      clearTimeout(readTimer);
      // Drain to free the socket; we don't read the body.
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore body-read errors */
      }
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, status: res.status };
      }
      lastErr = {
        ok: false,
        reason: "http",
        status: res.status,
        message: `HTTP ${res.status}`,
      };
      // 4xx (except 408/429) is a client error — don't retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        return lastErr;
      }
    } catch (err) {
      clearTimeout(connectTimer);
      clearTimeout(readTimer);
      const e = err as Error & { name?: string };
      const aborted =
        e.name === "AbortError" || ac.signal.aborted || /aborted/i.test(e.message ?? "");
      const timeout =
        aborted && /timeout/i.test(ac.signal.reason?.toString() ?? "");
      lastErr = aborted
        ? {
            ok: false,
            reason: timeout ? "timeout" : "aborted",
            message: e.message ?? "aborted",
          }
        : {
            ok: false,
            reason: "network",
            message: e.message ?? "network error",
          };
    }
  }

  return (
    lastErr ?? {
      ok: false,
      reason: "network",
      message: "transport gave up after retries",
    }
  );
}