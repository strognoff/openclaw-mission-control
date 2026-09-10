/**
 * Sender — owns the in-memory event queue, heartbeat scheduler, and flush loop.
 *
 * Public surface:
 *   const sender = createSender({ config, logger });
 *   sender.enqueue(payload);              // never throws
 *   sender.enqueueMany([...]);            // never throws
 *   sender.start();                       // arm heartbeat + flush loop
 *   sender.stop();                        // clear timers
 *   sender.flushNow();                    // force a flush attempt
 *
 * All exported functions are safe to call from inside any hook handler. The
 * plugin code path can never throw into OpenClaw.
 */

import type { McEventPayload, AgentStatus } from "@openclaw-mc/shared";
import { createBoundedQueue, type BoundedQueue } from "./queue.js";
import { postJson, type TransportResult } from "./transport.js";
import type { PluginConfig } from "./config.js";

export interface SenderLogger {
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface SenderDeps {
  config: PluginConfig;
  logger: SenderLogger;
  /** Inject a custom transport for tests. Defaults to postJson. */
  transport?: typeof postJson;
  /** Inject a sleep for tests. Defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Sender {
  enqueue(payload: McEventPayload): void;
  enqueueMany(payloads: McEventPayload[]): void;
  start(): void;
  stop(): void;
  flushNow(): Promise<void>;
  /** Read-only stats; handy for the dashboard-debug plugin command later. */
  stats(): SenderStats;
}

export interface SenderStats {
  queued: number;
  dropped: number;
  sent: number;
  failed: number;
  heartbeats: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSender(deps: SenderDeps): Sender {
  const { config, logger } = deps;
  const transport = deps.transport ?? postJson;
  const sleep = deps.sleep ?? defaultSleep;

  const queue: BoundedQueue<McEventPayload> = createBoundedQueue<McEventPayload>(
    config.queueSize,
  );

  const stats: SenderStats = {
    queued: 0,
    dropped: 0,
    sent: 0,
    failed: 0,
    heartbeats: 0,
  };

  let heartbeatTimer: NodeJS.Timeout | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let inFlight = false;
  let stopped = true;

  /** Decide what URL to call based on the payload kind. */
  function urlFor(): string {
    return `${config.url.replace(/\/+$/, "")}/events`;
  }

  function headersFor(): Record<string, string> {
    return config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
  }

  function enqueue(payload: McEventPayload): void {
    if (config.disablePlugin) return;
    if (!config.url || !config.agentId) {
      logger.warn("mc: enqueue skipped — missing url or agentId in plugin config");
      return;
    }
    try {
      const { dropped } = queue.push(payload);
      if (dropped > 0) {
        stats.dropped += dropped;
        logger.warn("mc: queue full, dropped oldest", { dropped });
      }
      stats.queued = queue.size();
    } catch (err) {
      logger.warn("mc: enqueue failed", { err: (err as Error).message });
    }
  }

  function enqueueMany(payloads: McEventPayload[]): void {
    for (const p of payloads) enqueue(p);
  }

  async function flushOnce(): Promise<void> {
    if (inFlight) return;
    const batch = queue.drain(100);
    if (batch.length === 0) return;
    inFlight = true;
    try {
      // Annotate each event with agentId (server expects it on register, but
      // also here so a server restart with no agents can re-key correctly).
      const annotated = batch.map((p) => ({ ...p, metadata: { ...(p.metadata ?? {}), _agentId: config.agentId } }));
      const result: TransportResult = await transport({
        url: urlFor(),
        apiKey: config.apiKey,
        body: { events: annotated },
        connectTimeoutMs: config.connectTimeoutMs,
        readTimeoutMs: config.readTimeoutMs,
        maxRetries: config.maxRetries,
        onRetry: (attempt, delay, reason) => {
          logger.warn("mc: retrying", { attempt, delay, reason });
        },
      });
      if (result.ok) {
        stats.sent += batch.length;
        logger.debug("mc: flushed", { count: batch.length });
      } else {
        stats.failed += batch.length;
        logger.warn("mc: flush failed", {
          count: batch.length,
          reason: result.reason,
          message: result.message,
          status: result.status,
        });
        // Put the batch back at the head so we retry on the next tick.
        for (let i = batch.length - 1; i >= 0; i--) {
          queue.push(batch[i]!);
        }
      }
    } catch (err) {
      stats.failed += batch.length;
      logger.warn("mc: flush threw — this should be impossible", {
        err: (err as Error).message,
      });
    } finally {
      inFlight = false;
      stats.queued = queue.size();
    }
  }

  function tickFlush(): void {
    flushTimer = setTimeout(async () => {
      try {
        await flushOnce();
      } catch {
        /* swallow */
      }
      if (!stopped) tickFlush();
    }, 1_000);
  }

  function tickHeartbeat(): void {
    heartbeatTimer = setTimeout(() => {
      try {
        stats.heartbeats++;
        enqueue({
          type: "heartbeat",
          status: "IDLE",
          activity: "Heartbeat",
          timestamp: new Date().toISOString(),
          metadata: {
            _agentId: config.agentId,
            host: undefined,
          },
        });
      } catch {
        /* swallow */
      }
      if (!stopped) tickHeartbeat();
    }, config.heartbeatMs);
  }

  function start(): void {
    if (!stopped) return;
    stopped = false;
    tickFlush();
    tickHeartbeat();
    logger.info("mc: sender started", { heartbeatMs: config.heartbeatMs });
  }

  function stop(): void {
    stopped = true;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (flushTimer) clearTimeout(flushTimer);
    heartbeatTimer = null;
    flushTimer = null;
    logger.info("mc: sender stopped");
  }

  async function flushNow(): Promise<void> {
    try {
      await flushOnce();
    } catch {
      /* swallow */
    }
  }

  function getStats(): SenderStats {
    return { ...stats, queued: queue.size() };
  }

  return {
    enqueue,
    enqueueMany,
    start,
    stop,
    flushNow,
    stats: getStats,
  };
}

/** Build the heartbeat payload that the dashboard understands. */
export function heartbeatPayload(agentId: string, status: AgentStatus): McEventPayload {
  return {
    type: "heartbeat",
    status,
    activity: "Heartbeat",
    timestamp: new Date().toISOString(),
    metadata: { _agentId: agentId },
  };
}