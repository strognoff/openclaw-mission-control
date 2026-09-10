/**
 * Bridge from OpenClaw hook contexts to sanitised Mission Control events.
 *
 * This module owns two things:
 *  1. The narrow extraction of safe fields out of whatever a hook context
 *     happens to contain. Every property access is defensive — if a field
 *     is missing, the resulting event just won't have it. No throws.
 *  2. The mapping table from OpenClaw hook name -> spec event type. See
 *     packages/plugin/docs/hook-mapping.md for the reasoning behind each.
 */

import type {
  McEventPayload,
  AgentStatus,
  EventType,
} from "@openclaw-mc/shared";
import { sanitise } from "@openclaw-mc/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CommonCtx {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  workspaceDir?: string;
  modelProviderId?: string;
  modelId?: string;
}

function pickAgentStatus(value: unknown): AgentStatus | undefined {
  const valid: AgentStatus[] = [
    "IDLE",
    "WORKING",
    "THINKING",
    "TOOL",
    "WAITING",
    "COMPLETE",
    "ERROR",
    "OFFLINE",
  ];
  if (typeof value === "string" && (valid as string[]).includes(value)) {
    return value as AgentStatus;
  }
  return undefined;
}

function cleanString(value: unknown, max = 200): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface BuilderState {
  agentName: string;
  hostname: string;
  platform: string;
  openclawVersion: string;
}

function baseFields(state: BuilderState) {
  return {
    host: state.hostname,
    agentName: state.agentName,
    platform: state.platform,
    openclawVersion: state.openclawVersion,
  };
}

function buildPayload(
  state: BuilderState,
  type: EventType,
  fields: Partial<McEventPayload>,
  ctx?: CommonCtx,
  extra?: Record<string, unknown>,
): McEventPayload {
  const md: Record<string, unknown> = { ...baseFields(state) };
  if (ctx?.modelProviderId) md.provider = ctx.modelProviderId;
  if (ctx?.modelId) md.model = ctx.modelId;
  if (ctx?.runId) md.runId = ctx.runId;
  if (ctx?.sessionId) md.sessionId = ctx.sessionId;
  if (ctx?.sessionKey) md.sessionKey = ctx.sessionKey;
  if (extra) Object.assign(md, extra);
  // Defensive: sanitise again here in case a hook surface ever sneaks a
  // sensitive field in via `extra`. The whole metadata blob survives.
  const payload: McEventPayload = {
    type,
    timestamp: nowIso(),
    ...fields,
    metadata: sanitise(md) as Record<string, unknown>,
  };
  return payload;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Per-hook mappers. Each takes the (event, ctx) tuple from `api.on(...)`.
 * Every mapper is total: if it can't produce a meaningful event, it returns
 * null and the sender drops it. NEVER throws.
 * ──────────────────────────────────────────────────────────────────────────── */

export function mapAgentRunStart(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  // PRIVACY: we deliberately do NOT include event.prompt here. We only honour
  // an explicit `task` field. Plugins/operators that want a dashboard-visible
  // task label must put it on `task` themselves.
  const task = cleanString(event?.task ?? "");
  return buildPayload(
    state,
    "run_started",
    {
      status: "WORKING",
      task,
      activity: task ? `Task started: ${task}` : "Task started",
    },
    ctx,
    event?.provider || event?.model ? { provider: event?.provider, model: event?.model } : undefined,
  );
}

export function mapAgentRunEnd(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  const success = event?.success !== false;
  const err = cleanString(event?.error ?? event?.errorMessage);
  const duration = typeof event?.durationMs === "number" ? event.durationMs : undefined;
  return buildPayload(
    state,
    success ? "run_completed" : "run_failed",
    {
      status: success ? "COMPLETE" : "ERROR",
      activity: success ? "Task completed" : `Task failed${err ? `: ${err}` : ""}`,
    },
    ctx,
    {
      success,
      ...(duration !== undefined ? { durationMs: duration } : {}),
      ...(err ? { errorSummary: err } : {}),
    },
  );
}

export function mapModelCallStart(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  return buildPayload(
    state,
    "thinking",
    {
      status: "THINKING",
      activity: `Thinking (${event?.model ?? ctx.modelId ?? "model"})`,
    },
    ctx,
  );
}

export function mapToolStart(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  const tool = cleanString(event?.toolName);
  return buildPayload(
    state,
    "tool_started",
    {
      status: "TOOL",
      tool,
      activity: tool ? `Tool started: ${tool}` : "Tool started",
    },
    ctx,
  );
}

export function mapToolEnd(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  const tool = cleanString(event?.toolName);
  const error = cleanString(event?.error);
  const success = !error;
  return buildPayload(
    state,
    success ? "tool_completed" : "tool_failed",
    {
      status: success ? "IDLE" : "ERROR",
      tool,
      activity: tool
        ? success
          ? `Tool completed: ${tool}`
          : `Tool failed: ${tool}${error ? ` — ${error}` : ""}`
        : "Tool finished",
    },
    ctx,
    success ? undefined : { errorSummary: error },
  );
}

export function mapGatewayStart(
  state: BuilderState,
  ctx: CommonCtx,
): McEventPayload | null {
  return buildPayload(
    state,
    "agent_online",
    {
      status: "IDLE",
      activity: "Gateway started",
    },
    ctx,
    { port: (ctx as any)?.port },
  );
}

export function mapGatewayStop(
  state: BuilderState,
  ctx: CommonCtx,
): McEventPayload | null {
  return buildPayload(
    state,
    "agent_offline",
    {
      status: "OFFLINE",
      activity: "Gateway stopping",
    },
    ctx,
  );
}

export function mapSessionEnd(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  const reason: string | undefined = event?.reason;
  // shutdown/restart → truly offline; others are session lifecycle but the
  // bot is still alive.
  if (reason === "shutdown" || reason === "deleted") {
    return buildPayload(
      state,
      "agent_offline",
      { status: "OFFLINE", activity: `Session ended (${reason ?? "unknown"})` },
      ctx,
      { reason },
    );
  }
  return buildPayload(
    state,
    "status_changed",
    {
      status: "IDLE",
      activity: `Session ended (${reason ?? "unknown"})`,
    },
    ctx,
    { reason },
  );
}

export function mapSessionStart(
  state: BuilderState,
  event: any,
  ctx: CommonCtx,
): McEventPayload | null {
  return buildPayload(
    state,
    "agent_online",
    {
      status: "IDLE",
      activity: event?.resumedFrom ? `Session resumed` : "Session started",
    },
    ctx,
  );
}

export function mapHeartbeat(state: BuilderState, ctx: CommonCtx): McEventPayload {
  return buildPayload(
    state,
    "heartbeat",
    { status: "IDLE", activity: "Heartbeat" },
    ctx,
  );
}

export function mapStatusChange(
  state: BuilderState,
  status: AgentStatus,
  activity: string | undefined,
  ctx: CommonCtx,
): McEventPayload {
  return buildPayload(state, "status_changed", { status, activity }, ctx);
}

export function mapWaiting(state: BuilderState, ctx: CommonCtx): McEventPayload {
  return buildPayload(state, "waiting", { status: "WAITING", activity: "Waiting" }, ctx);
}

/** Pick a sanitised task label from a model-call hook context. Never throws. */
export function safeTaskFromContext(event: any, ctx: CommonCtx): string | undefined {
  // We deliberately DO NOT include the prompt text. If the operator has set
  // a task label somewhere upstream, that wins. Otherwise return nothing.
  if (typeof event?.task === "string") return cleanString(event.task);
  if (typeof event?.cleanedBody === "string" && event.cleanedBody.length < 100) {
    return cleanString(event.cleanedBody);
  }
  return undefined;
}

export function safeProviderFromContext(event: any, ctx: CommonCtx): string | undefined {
  if (typeof event?.provider === "string") return cleanString(event.provider);
  if (typeof ctx.modelProviderId === "string") return cleanString(ctx.modelProviderId);
  return undefined;
}

export function safeModelFromContext(event: any, ctx: CommonCtx): string | undefined {
  if (typeof event?.model === "string") return cleanString(event.model);
  if (typeof ctx.modelId === "string") return cleanString(ctx.modelId);
  return undefined;
}

export function ensureAgentStatus(value: unknown, fallback: AgentStatus): AgentStatus {
  return pickAgentStatus(value) ?? fallback;
}