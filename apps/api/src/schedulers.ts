/**
 * Background schedulers.
 *
 * Two independent loops run inside the API process:
 *   1. **Offline reaper** — every `MC_REAPER_INTERVAL_MS`, find Agents
 *      whose lastHeartbeat is older than `MC_OFFLINE_AFTER_MS` and mark
 *      them OFFLINE.
 *   2. **Retention** — every `MC_RETENTION_INTERVAL_MS`, delete Event rows
 *      older than `MC_RETENTION_DAYS`. Run rows are kept indefinitely.
 *
 * Retention is guarded by a file lock so multiple API processes (e.g. dev
 * + prod on the same box) don't all hammer the same table at once.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPrisma } from "./db.js";
import type { SseBroker } from "./sse-broker.js";
import type { SseMessage } from "@openclaw-mc/shared";

export interface SchedulerHandle {
  stop(): void;
}

export function startOfflineReaper(
  broker: SseBroker,
  opts: { intervalMs: number; offlineAfterMs: number; logger: { info: (m: string) => void; warn: (m: string) => void } },
): SchedulerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const cutoff = new Date(Date.now() - opts.offlineAfterMs);
      const stale = await getPrisma().agent.findMany({
        where: {
          lastHeartbeat: { lt: cutoff },
          currentStatus: { not: "OFFLINE" },
        },
      });
      for (const agent of stale) {
        await getPrisma().agent.update({
          where: { id: agent.id },
          data: { currentStatus: "OFFLINE", updatedAt: new Date() },
        });
        const msg: SseMessage = {
          type: "agent_updated",
          agent: { ...agent, currentStatus: "OFFLINE" } as any,
        };
        broker.publish(msg);
        opts.logger.info(`marked agent ${agent.id} OFFLINE`);
      }
    } catch (err) {
      opts.logger.warn(`offline reaper error: ${(err as Error).message}`);
    }
    if (!stopped) timer = setTimeout(() => void tick(), opts.intervalMs);
  }

  timer = setTimeout(() => void tick(), opts.intervalMs);
  opts.logger.info(
    `offline reaper started (interval=${opts.intervalMs}ms, threshold=${opts.offlineAfterMs}ms)`,
  );

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * File-lock helper. Uses POSIX `flock(2)` semantics via a sidecar fd-less
 * approach: we try to create+write a marker file atomically; if the file
 * already exists AND is younger than 1 hour, we skip this run. If it's
 * older, we steal it.
 */
async function tryAcquireLock(lockfile: string): Promise<boolean> {
  const maxAgeMs = 60 * 60 * 1000; // 1 hour
  try {
    const fd = await fs.open(lockfile, "wx"); // exclusive create
    await fd.writeFile(`${process.pid}\n${Date.now()}\n`);
    await fd.close();
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "EEXIST") {
      // Permission error etc. — be permissive; don't crash the API.
      return true;
    }
    // Existing lock — check age.
    try {
      const stat = await fs.stat(lockfile);
      if (Date.now() - stat.mtimeMs > maxAgeMs) {
        // Stale; steal it.
        await fs.writeFile(lockfile, `${process.pid}\n${Date.now()}\n`);
        return true;
      }
    } catch {
      // Lost the race; another process is in the middle.
    }
    return false;
  }
}

export function startRetention(
  opts: {
    intervalMs: number;
    retentionDays: number;
    lockfile: string;
    logger: { info: (m: string) => void; warn: (m: string) => void };
  },
): SchedulerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const acquired = await tryAcquireLock(opts.lockfile);
      if (!acquired) {
        opts.logger.warn("retention: another process holds the lock — skipping");
      } else {
        try {
          const cutoff = new Date(Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000);
          const result = await getPrisma().event.deleteMany({
            where: { timestamp: { lt: cutoff } },
          });
          if (result.count > 0) {
            opts.logger.info(
              `retention: deleted ${result.count} events older than ${opts.retentionDays}d`,
            );
          }
        } finally {
          await fs.rm(opts.lockfile, { force: true });
        }
      }
    } catch (err) {
      opts.logger.warn(`retention error: ${(err as Error).message}`);
    }
    if (!stopped) timer = setTimeout(() => void tick(), opts.intervalMs);
  }

  timer = setTimeout(() => void tick(), opts.intervalMs);
  opts.logger.info(
    `retention started (interval=${opts.intervalMs}ms, days=${opts.retentionDays})`,
  );

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** One-shot retention: runs immediately and resolves. Used by tests. */
export async function runRetentionOnce(opts: {
  retentionDays: number;
  lockfile: string;
  logger: { info: (m: string) => void; warn: (m: string) => void };
}): Promise<{ deleted: number }> {
  const acquired = await tryAcquireLock(opts.lockfile);
  if (!acquired) {
    opts.logger.warn("retention: another process holds the lock — skipping");
    return { deleted: 0 };
  }
  try {
    const cutoff = new Date(Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000);
    const result = await getPrisma().event.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    return { deleted: result.count };
  } finally {
    await fs.rm(opts.lockfile, { force: true });
  }
}

/** Helper for ops scripts: where would a fresh lock file live by default? */
export function defaultLockfile(): string {
  return path.join(os.tmpdir(), "menuboard-agents-api.retention.lock");
}