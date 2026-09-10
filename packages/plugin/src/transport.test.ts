import { describe, it, expect, vi } from "vitest";
import { postJson } from "./transport.js";

const ok = (status = 202) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }) as unknown as Response;

describe("postJson transport", () => {
  it("returns ok on 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(202));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: { events: [] },
        connectTimeoutMs: 1000,
        readTimeoutMs: 1000,
        maxRetries: 0,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.status).toBe(202);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("does not retry on 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(400));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: {},
        connectTimeoutMs: 1000,
        readTimeoutMs: 1000,
        maxRetries: 3,
      });
      expect(r.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("retries on network errors up to maxRetries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: {},
        connectTimeoutMs: 100,
        readTimeoutMs: 100,
        maxRetries: 2,
      });
      expect(r.ok).toBe(false);
      // initial + 2 retries = 3 attempts
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("returns ok after a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok(202));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: {},
        connectTimeoutMs: 100,
        readTimeoutMs: 100,
        maxRetries: 3,
      });
      expect(r.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("retries on 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(503))
      .mockResolvedValueOnce(ok(202));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: {},
        connectTimeoutMs: 100,
        readTimeoutMs: 100,
        maxRetries: 3,
      });
      expect(r.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("retries on 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(429))
      .mockResolvedValueOnce(ok(202));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: {},
        connectTimeoutMs: 100,
        readTimeoutMs: 100,
        maxRetries: 3,
      });
      expect(r.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).fetch = real;
    }
  });

  it("serializes the body once even on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(ok(202));
    const real = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      const r = await postJson({
        url: "http://x/events",
        apiKey: "k",
        body: { hello: "world" },
        connectTimeoutMs: 100,
        readTimeoutMs: 100,
        maxRetries: 2,
      });
      expect(r.ok).toBe(true);
      const bodies = fetchMock.mock.calls.map((c) => c[1]?.body);
      expect(bodies[0]).toBe('{"hello":"world"}');
      expect(bodies[1]).toBe('{"hello":"world"}');
    } finally {
      (globalThis as any).fetch = real;
    }
  });
});