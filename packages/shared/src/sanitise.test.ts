import { describe, it, expect } from "vitest";
import {
  sanitise,
  sanitiseEvent,
  ALLOWED_STRING_FIELDS,
  ALLOWED_NUMERIC_FIELDS,
  SENSITIVE_KEY_PATTERNS,
} from "./sanitise.js";

describe("sanitise", () => {
  it("returns null and undefined as-is", () => {
    expect(sanitise(null)).toBeNull();
    expect(sanitise(undefined)).toBeUndefined();
  });

  it("passes primitives through unchanged when safe", () => {
    expect(sanitise(42)).toBe(42);
    expect(sanitise(0)).toBe(0);
    expect(sanitise(true)).toBe(true);
    expect(sanitise(false)).toBe(false);
    expect(sanitise("hello world")).toBe("hello world");
  });

  it("replaces non-finite numbers with [redacted]", () => {
    expect(sanitise(Number.NaN)).toBe("[redacted]");
    expect(sanitise(Number.POSITIVE_INFINITY)).toBe("[redacted]");
    expect(sanitise(Number.NEGATIVE_INFINITY)).toBe("[redacted]");
  });

  it("redacts obvious token-shaped strings regardless of key", () => {
    expect(sanitise({ msg: "my token is sk-proj-abc123def456ghi789" })).toEqual({
      msg: "[redacted]",
    });
    expect(
      sanitise({ foo: "Bearer eyJabc1234567890abcdef.eyJabc12345.signature" }),
    ).toEqual({ foo: "[redacted]" });
    expect(
      sanitise({ foo: "Authorization: Bearer abcdefghijklmnop1234" }),
    ).toEqual({ foo: "[redacted]" });
    expect(sanitise({ foo: "password: hunter2hunter2hunter" })).toEqual({
      foo: "[redacted]",
    });
    expect(sanitise({ foo: "cookie: sid=deadbeefcafe" })).toEqual({
      foo: "[redacted]",
    });
    expect(
      sanitise({ foo: "-----BEGIN RSA PRIVATE KEY-----\nMIIE..." }),
    ).toEqual({ foo: "[redacted]" });
  });

  it("truncates whitelisted string fields to 200 chars", () => {
    const long = "x".repeat(500);
    const out = sanitise({ activity: long, task: long }) as Record<string, unknown>;
    expect((out.activity as string).length).toBe(201); // 200 chars + ellipsis
    expect((out.task as string).length).toBe(201);
  });

  it("truncates non-whitelisted strings to 200 chars (defensive)", () => {
    const long = "x".repeat(500);
    const out = sanitise({ whatever: long }) as Record<string, unknown>;
    expect((out.whatever as string).length).toBe(201);
  });

  it("redacts any key matching sensitive patterns", () => {
    const input = {
      api_key: "abc",
      apiKey: "abc",
      API_KEY: "abc",
      prompt: "secret prompt",
      response: "secret response",
      authorization: "Bearer xyz",
      cookie: "session=abc",
      token: "abc",
      password: "abc",
      secret: "abc",
      output: "abc",
      env: { FOO: "bar" },
      body: "abc",
      headers: { a: "b" },
      header: { a: "b" },
    };
    const out = sanitise(input) as Record<string, unknown>;
    expect(out.api_key).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.API_KEY).toBe("[redacted]");
    expect(out.prompt).toBe("[redacted]");
    expect(out.response).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.cookie).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    expect(out.secret).toBe("[redacted]");
    expect(out.output).toBe("[redacted]");
    expect(out.env).toBe("[redacted]");
    expect(out.body).toBe("[redacted]");
    expect(out.headers).toBe("[redacted]");
    expect(out.header).toBe("[redacted]");
  });

  it("redacts nested objects whose key is sensitive", () => {
    const out = sanitise({
      tools: { prompt: { full: "sensitive" } },
      params: { authorization: "Bearer z" },
    }) as Record<string, unknown>;
    expect(out).toEqual({
      tools: { prompt: "[redacted]" },
      params: { authorization: "[redacted]" },
    });
  });

  it("redacts inside arrays when their elements contain sensitive content", () => {
    const out = sanitise({
      messages: ["hello", { prompt: "secret", content: "ok" }],
    }) as Record<string, unknown>;
    expect(out).toEqual({
      messages: ["hello", { prompt: "[redacted]", content: "ok" }],
    });
  });

  it("passes through whitelisted numeric progress fields", () => {
    const out = sanitise({
      progressCurrent: 4,
      progressTotal: 6,
      progressPercent: 66.7,
    }) as Record<string, unknown>;
    expect(out.progressCurrent).toBe(4);
    expect(out.progressTotal).toBe(6);
    expect(out.progressPercent).toBe(66.7);
  });

  it("redacts non-finite whitelisted numeric fields", () => {
    const out = sanitise({ progressPercent: Number.NaN }) as Record<
      string,
      unknown
    >;
    expect(out.progressPercent).toBe("[redacted]");
  });

  it("handles cyclic structures without throwing", () => {
    const a: Record<string, unknown> = { name: "root" };
    const b: Record<string, unknown> = { name: "child", parent: a };
    a.child = b;
    expect(() => sanitise(a)).not.toThrow();
    // Cyclic node is replaced.
    const out = sanitise(a) as Record<string, unknown>;
    const child = out.child as Record<string, unknown>;
    expect(child.parent).toBe("[redacted]");
  });

  it("exposes the documented whitelist and patterns", () => {
    expect(ALLOWED_STRING_FIELDS.has("activity")).toBe(true);
    expect(ALLOWED_STRING_FIELDS.has("task")).toBe(true);
    expect(ALLOWED_NUMERIC_FIELDS.has("progressCurrent")).toBe(true);
    expect(SENSITIVE_KEY_PATTERNS.length).toBeGreaterThanOrEqual(8);
  });
});

describe("sanitiseEvent", () => {
  it("preserves whitelisted event fields", () => {
    const event = {
      type: "tool_started",
      status: "TOOL",
      activity: "Running shell",
      task: "Test mission control",
      tool: "shell",
      runId: "run-1",
      sessionId: "session-1",
      timestamp: "2026-09-10T13:00:00Z",
      progressCurrent: 2,
      progressTotal: 6,
      progressPercent: 33.3,
      progressLabel: "step 2 of 6",
      metadata: { provider: "openai", model: "gpt-5.4" },
    };
    const out = sanitiseEvent(event);
    expect(out).toEqual(event);
  });

  it("strips prompt/response/cookies/env/etc from nested metadata", () => {
    const event = {
      type: "tool_started",
      activity: "Browser tool",
      metadata: {
        provider: "openai",
        prompt: "the actual prompt",
        response: "the actual response",
        cookies: { sid: "deadbeef" },
        env: { API_KEY: "sk-abc" },
        headers: { authorization: "Bearer z" },
        output: "raw stdout",
      },
    };
    const out = sanitiseEvent(event) as Record<string, unknown>;
    const md = out.metadata as Record<string, unknown>;
    expect(md.provider).toBe("openai");
    expect(md.prompt).toBe("[redacted]");
    expect(md.response).toBe("[redacted]");
    expect(md.cookies).toBe("[redacted]");
    expect(md.env).toBe("[redacted]");
    expect(md.headers).toBe("[redacted]");
    expect(md.output).toBe("[redacted]");
  });

  it("redacts whole field if it contains a token pattern", () => {
    const event = {
      type: "thinking",
      activity: "Reading response from openai",
      metadata: { provider: "openai", model: "gpt-5.4" },
      notes: "I just saw sk-proj-abc123def456ghi789 in the env",
    };
    const out = sanitiseEvent(event) as Record<string, unknown>;
    expect(out.notes).toBe("[redacted]");
  });
});