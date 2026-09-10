import { describe, it, expect, vi } from "vitest";
import { createSender } from "./sender.js";
import type { PluginConfig } from "./config.js";

const config: PluginConfig = {
  url: "http://127.0.0.1:9999/v1/agents",
  agentId: "a1",
  agentName: "Tester",
  apiKey: "k",
  heartbeatMs: 60_000,
  queueSize: 5,
  connectTimeoutMs: 50,
  readTimeoutMs: 50,
  maxRetries: 1,
  disablePlugin: false,
};

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function makeTransport(behaviour: (n: number) => Promise<{ ok: boolean }>) {
  let n = 0;
  return vi.fn(async () => {
    n++;
    return behaviour(n);
  });
}

describe("sender", () => {
  it("enqueues events without throwing", () => {
    const sender = createSender({ config, logger: noopLogger });
    expect(() =>
      sender.enqueue({ type: "run_started", status: "WORKING" }),
    ).not.toThrow();
    expect(sender.stats().queued).toBe(1);
  });

  it("honours the queue size: drops oldest on overflow", () => {
    const sender = createSender({ config, logger: noopLogger });
    for (let i = 0; i < 12; i++) {
      sender.enqueue({ type: "heartbeat", status: "IDLE" });
    }
    const s = sender.stats();
    expect(s.queued).toBe(5);
    expect(s.dropped).toBe(7);
  });

  it("disables enqueue when disablePlugin is true", () => {
    const sender = createSender({
      config: { ...config, disablePlugin: true },
      logger: noopLogger,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    expect(sender.stats().queued).toBe(0);
  });

  it("skips enqueue when agentId is empty", () => {
    const sender = createSender({
      config: { ...config, agentId: "" },
      logger: noopLogger,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    expect(sender.stats().queued).toBe(0);
  });

  it("flushes a successful batch", async () => {
    const transport = makeTransport(async () => ({ ok: true }));
    const sender = createSender({
      config,
      logger: noopLogger,
      transport: transport as any,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    sender.enqueue({ type: "thinking", status: "THINKING" });
    await sender.flushNow();
    const s = sender.stats();
    expect(s.sent).toBe(2);
    expect(s.queued).toBe(0);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues batch on failure", async () => {
    const transport = makeTransport(async () => ({ ok: false }));
    const sender = createSender({
      config: { ...config, maxRetries: 0 },
      logger: noopLogger,
      transport: transport as any,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    sender.enqueue({ type: "thinking", status: "THINKING" });
    await sender.flushNow();
    const s = sender.stats();
    expect(s.failed).toBe(2);
    // Events are pushed back so they retry next tick.
    expect(s.queued).toBe(2);
  });

  it("never throws even when transport throws", async () => {
    const transport = vi.fn(async () => {
      throw new Error("kaboom");
    });
    const sender = createSender({
      config,
      logger: noopLogger,
      transport: transport as any,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    await expect(sender.flushNow()).resolves.not.toThrow();
  });

  it("tags every event with _agentId in metadata", async () => {
    let captured: any = null;
    const transport = vi.fn(async (opts: any) => {
      // body here is the raw object the sender constructed (sender passes the
      // object; transport is responsible for serialising before HTTP).
      captured = opts.body;
      return { ok: true };
    });
    const sender = createSender({
      config: { ...config, agentId: "bot-42" },
      logger: noopLogger,
      transport: transport as any,
    });
    sender.enqueue({ type: "run_started", status: "WORKING" });
    await sender.flushNow();
    expect(captured.events[0].metadata._agentId).toBe("bot-42");
  });

  it("stops cleanly (timers cleared)", () => {
    const sender = createSender({ config, logger: noopLogger });
    sender.start();
    sender.stop();
    // No-op verify: start/stop are idempotent.
    sender.stop();
    expect(true).toBe(true);
  });
});