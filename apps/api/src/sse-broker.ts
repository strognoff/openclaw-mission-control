/**
 * In-process SSE broker.
 *
 * Every dashboard connection registers a subscriber; when a write happens
 * (new event, new agent, agent change), the broker fans out to all
 * subscribers. A periodic ping keeps the connection alive past proxy
 * idle timeouts.
 *
 * The broker is in-process. Multi-instance deployments would need a
 * pub/sub bus, but the spec is one-instance, so we don't go there.
 */

import type { Event, Agent } from "@prisma/client";
import type { SseMessage } from "@openclaw-mc/shared";

export interface SseSubscriber {
  id: number;
  /** Resolves with the encoded SSE chunk to write, or null to close. */
  write: (chunk: string) => Promise<void>;
  close: () => Promise<void>;
}

const HEARTBEAT_MS = 25_000;

export interface SseBroker {
  subscribe(sub: SseSubscriber): () => void;
  publish(msg: SseMessage): void;
  size(): number;
  stop(): void;
}

export function createSseBroker(): SseBroker {
  const subs = new Map<number, SseSubscriber>();
  let nextId = 1;
  let heartbeat: NodeJS.Timeout | null = null;
  let stopped = false;

  function safeWrite(sub: SseSubscriber, chunk: string): Promise<void> {
    try {
      return sub.write(chunk);
    } catch {
      return Promise.resolve();
    }
  }

  function encode(msg: SseMessage): string {
    return `event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`;
  }

  async function fanout(msg: SseMessage): Promise<void> {
    const chunk = encode(msg);
    const tasks: Promise<void>[] = [];
    for (const sub of subs.values()) {
      tasks.push(
        safeWrite(sub, chunk).catch(() => {
          // Best-effort cleanup of a broken subscriber.
          try {
            void sub.close();
          } catch {
            /* ignore */
          }
          subs.delete(sub.id);
        }),
      );
    }
    await Promise.allSettled(tasks);
  }

  function publish(msg: SseMessage): void {
    if (stopped) return;
    void fanout(msg);
  }

  function subscribe(sub: Omit<SseSubscriber, "id">): () => void {
    const id = nextId++;
    const full: SseSubscriber = { id, ...sub };
    subs.set(id, full);
    return () => {
      subs.delete(id);
    };
  }

  function size(): number {
    return subs.size;
  }

  function tick(): void {
    if (stopped) return;
    const ping = encode({ type: "ping", t: Date.now() });
    for (const sub of subs.values()) {
      void safeWrite(sub, ping);
    }
    heartbeat = setTimeout(tick, HEARTBEAT_MS);
  }

  function stop(): void {
    stopped = true;
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = null;
    for (const sub of subs.values()) {
      try {
        void sub.close();
      } catch {
        /* ignore */
      }
    }
    subs.clear();
  }

  // Arm the heartbeat once.
  heartbeat = setTimeout(tick, HEARTBEAT_MS);

  return { subscribe, publish, size, stop };
}

/** Publish helpers — keep the call sites in the routes readable. */
export function publishAgentAdded(broker: SseBroker, agent: Agent): void {
  broker.publish({ type: "agent_added", agent: agent as any });
}

export function publishAgentUpdated(broker: SseBroker, agent: Agent): void {
  broker.publish({ type: "agent_updated", agent: agent as any });
}

export function publishEventAdded(broker: SseBroker, event: Event): void {
  broker.publish({ type: "event_added", event: event as any });
}

export function publishAgentRemoved(broker: SseBroker, agentId: string): void {
  broker.publish({ type: "agent_removed", agentId });
}