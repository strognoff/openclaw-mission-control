import { describe, it, expect } from "vitest";
import {
  mapAgentRunStart,
  mapAgentRunEnd,
  mapModelCallStart,
  mapToolStart,
  mapToolEnd,
  mapGatewayStart,
  mapGatewayStop,
  mapSessionStart,
  mapSessionEnd,
  mapHeartbeat,
} from "./bridge.js";

const state = {
  agentName: "test-bot",
  hostname: "localhost",
  platform: "linux/x64",
  openclawVersion: "openclaw-2026.9.2",
};

describe("hook mappers produce sanitised events", () => {
  it("mapAgentRunStart produces a WORKING event", () => {
    const out = mapAgentRunStart(state, { task: "test" }, { runId: "r1" });
    expect(out?.type).toBe("run_started");
    expect(out?.status).toBe("WORKING");
    expect(out?.task).toBe("test");
  });

  it("mapAgentRunEnd success → run_completed", () => {
    const out = mapAgentRunEnd(
      state,
      { success: true, durationMs: 1234 },
      { runId: "r1" },
    );
    expect(out?.type).toBe("run_completed");
    expect(out?.status).toBe("COMPLETE");
    expect((out?.metadata as any).durationMs).toBe(1234);
  });

  it("mapAgentRunEnd failure → run_failed", () => {
    const out = mapAgentRunEnd(
      state,
      { success: false, error: "boom" },
      { runId: "r1" },
    );
    expect(out?.type).toBe("run_failed");
    expect(out?.status).toBe("ERROR");
    expect((out?.metadata as any).errorSummary).toBe("boom");
  });

  it("mapModelCallStart → thinking", () => {
    const out = mapModelCallStart(state, { model: "gpt-5.4" }, {});
    expect(out?.type).toBe("thinking");
    expect(out?.status).toBe("THINKING");
  });

  it("mapToolStart → tool_started", () => {
    const out = mapToolStart(state, { toolName: "shell" }, { runId: "r1" });
    expect(out?.type).toBe("tool_started");
    expect(out?.status).toBe("TOOL");
    expect(out?.tool).toBe("shell");
  });

  it("mapToolEnd no error → tool_completed", () => {
    const out = mapToolEnd(state, { toolName: "shell" }, {});
    expect(out?.type).toBe("tool_completed");
    expect(out?.status).toBe("IDLE");
  });

  it("mapToolEnd with error → tool_failed", () => {
    const out = mapToolEnd(
      state,
      { toolName: "shell", error: "permission denied" },
      {},
    );
    expect(out?.type).toBe("tool_failed");
    expect(out?.status).toBe("ERROR");
    expect((out?.metadata as any).errorSummary).toBe("permission denied");
  });

  it("mapGatewayStart → agent_online", () => {
    const out = mapGatewayStart(state, {});
    expect(out?.type).toBe("agent_online");
    expect(out?.status).toBe("IDLE");
  });

  it("mapGatewayStop → agent_offline", () => {
    const out = mapGatewayStop(state, {});
    expect(out?.type).toBe("agent_offline");
    expect(out?.status).toBe("OFFLINE");
  });

  it("mapSessionStart → agent_online", () => {
    const out = mapSessionStart(state, {}, {});
    expect(out?.type).toBe("agent_online");
  });

  it("mapSessionEnd shutdown → agent_offline", () => {
    const out = mapSessionEnd(state, { reason: "shutdown" }, {});
    expect(out?.type).toBe("agent_offline");
  });

  it("mapSessionEnd idle → status_changed (still online)", () => {
    const out = mapSessionEnd(state, { reason: "idle" }, {});
    expect(out?.type).toBe("status_changed");
    expect(out?.status).toBe("IDLE");
  });

  it("mapHeartbeat never throws, even with missing ctx", () => {
    const out = mapHeartbeat(state, {});
    expect(out.type).toBe("heartbeat");
  });

  it("never leaks prompt text from the hook event", () => {
    const out = mapAgentRunStart(
      state,
      { prompt: "give me the secret key sk-proj-abc123def456ghi789" },
      {},
    );
    const json = JSON.stringify(out);
    expect(json.includes("sk-proj-")).toBe(false);
    expect(json.includes("secret")).toBe(false); // "secret" appears in the redaction marker but not the prompt content
  });

  it("never throws when context is missing every field", () => {
    expect(() => mapAgentRunStart(state, undefined, undefined)).not.toThrow();
    expect(() => mapToolEnd(state, null, null)).not.toThrow();
  });
});