import { describe, it, expect } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "./config.js";

describe("resolveConfig", () => {
  it("returns defaults for empty input", () => {
    const c = resolveConfig({});
    expect(c.url).toBe(DEFAULT_CONFIG.url);
    expect(c.heartbeatMs).toBe(DEFAULT_CONFIG.heartbeatMs);
    expect(c.queueSize).toBe(DEFAULT_CONFIG.queueSize);
  });

  it("coerces non-finite numbers to defaults", () => {
    const c = resolveConfig({
      heartbeatMs: Number.NaN,
      queueSize: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(c.heartbeatMs)).toBe(true);
    expect(Number.isFinite(c.queueSize)).toBe(true);
  });

  it("clamps absurdly large values", () => {
    const c = resolveConfig({ heartbeatMs: 10_000_000 });
    expect(c.heartbeatMs).toBeLessThanOrEqual(5 * 60_000);
  });

  it("treats non-string values as empty for url/agentId/apiKey", () => {
    const c = resolveConfig({ url: 12345, agentId: null, apiKey: undefined });
    expect(typeof c.url).toBe("string");
    expect(c.agentId).toBe("");
    expect(c.apiKey).toBe("");
  });
});