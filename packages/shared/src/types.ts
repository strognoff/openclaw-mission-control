/**
 * OpenClaw Mission Control — shared types.
 *
 * Single source of truth for:
 *  - Spec event types (the events we record on the wire)
 *  - API request/response shapes
 *  - Internal data shapes (Agent/Run/Event/ApiKey)
 *
 * Keep this file dependency-free (no zod, no fetch, no Node built-ins beyond types).
 * Validation lives in the API package; the plugin only depends on the shapes here.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Spec event types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The narrow set of event types Mission Control records.
 * See README "Event-type mapping" for the OpenClaw hook each one comes from.
 */
export const EVENT_TYPES = [
  "agent_online",
  "agent_offline",
  "run_started",
  "run_completed",
  "run_failed",
  "thinking",
  "tool_started",
  "tool_completed",
  "tool_failed",
  "waiting",
  "heartbeat",
  "status_changed",
  // Message-level hooks (harness-independent — fire on every runtime)
  "message_received",
  "message_sent",
  // Subagent lifecycle
  "subagent_spawned",
  "subagent_ended",
  // Cron
  "cron_reconciled",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * The display-only statuses we surface on Agent.currentStatus.
 * Sourced from EVENT_TYPES (everything except heartbeat), plus the synthesized OFFLINE.
 */
export const AGENT_STATUSES = [
  "IDLE",
  "WORKING",
  "THINKING",
  "TOOL",
  "WAITING",
  "COMPLETE",
  "ERROR",
  "OFFLINE",
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

// ──────────────────────────────────────────────────────────────────────────────
// Event payload (the wire shape between plugin → API)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * What the plugin sends over the wire.
 * `metadata` must be sanitised by the plugin before this object is built.
 *
 * The shape is intentionally small: enough to power the dashboard, never
 * enough to leak prompts, responses, headers, or env.
 */
export interface McEventPayload {
  /** Event discriminator from EVENT_TYPES. */
  type: EventType;
  /** Display status that should be applied to the agent. Optional for heartbeats. */
  status?: AgentStatus;
  /** Short, sanitised task label (e.g. "Update Mission Control dashboard"). Max 200 chars. */
  task?: string;
  /** Short, sanitised activity description (e.g. "Executing shell tool"). Max 200 chars. */
  activity?: string;
  /** Tool name when the event is tool-related. */
  tool?: string;
  /** OpenClaw run id, when the plugin can derive one from the hook context. */
  runId?: string;
  /** OpenClaw session id / sessionKey. */
  sessionId?: string;
  /** RFC3339 timestamp from the host (UTC). */
  timestamp?: string;
  /** Bounded numeric progress (optional, only on tool_started). */
  progressCurrent?: number;
  progressTotal?: number;
  progressPercent?: number;
  progressLabel?: string;
  /** Free-form but sanitised metadata; the API persists this as JSON. */
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// API contract — requests and responses
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Body for POST /v1/agents/events.
 * The API returns 202 + a list of generated event ids in the same order.
 */
export interface IngestEventsRequest {
  events: McEventPayload[];
}

export interface IngestEventsResponse {
  ids: string[];
}

/** Body for POST /v1/agents/register. */
export interface RegisterAgentRequest {
  agentId: string;
  name: string;
  hostname: string;
  platform: string;
  openclawVersion: string;
  /**
   * The plaintext agent API key the operator provisioned for this bot.
   * The API bcrypt-hashes it and returns the metadata; the plaintext is never stored.
   */
  apiKey: string;
}

export interface RegisterAgentResponse {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  openclawVersion: string;
  apiKeyId: string;
  apiKeyPrefix: string;
  createdAt: string;
}

/** Body for POST /v1/agents/heartbeat. */
export interface HeartbeatRequest {
  status?: AgentStatus;
  task?: string;
  activity?: string;
  tool?: string;
  runId?: string;
}

export interface HeartbeatResponse {
  lastHeartbeat: string;
  /** Echo of what the agent should consider its current state. */
  currentStatus: AgentStatus;
}

/** Body for POST /v1/agents/admin/keys. */
export interface CreateApiKeyRequest {
  agentId: string;
  label?: string;
}

export interface CreateApiKeyResponse {
  id: string;
  agentId: string;
  /** Plaintext API key. Returned ONCE; the API only stores the bcrypt hash. */
  apiKey: string;
  keyPrefix: string;
  label: string | null;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Stored shapes (mirrors Prisma models on the API side)
// ──────────────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  openclawVersion: string;
  currentStatus: AgentStatus;
  currentTask: string | null;
  currentActivity: string | null;
  currentTool: string | null;
  provider: string | null;
  model: string | null;
  lastHeartbeat: string;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  sessionId: string | null;
  task: string | null;
  status: AgentStatus;
  provider: string | null;
  model: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  toolCallCount: number;
  errorSummary: string | null;
}

export interface Event {
  id: string;
  agentId: string;
  runId: string | null;
  type: EventType;
  status: AgentStatus | null;
  activity: string | null;
  tool: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

export interface ApiKey {
  id: string;
  agentId: string;
  keyPrefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// SSE envelope
// ──────────────────────────────────────────────────────────────────────────────

/**
 * One SSE message. The dashboard's EventSource handler uses the discriminator
 * to route to the right reducer.
 */
export type SseMessage =
  | { type: "agent_added"; agent: Agent }
  | { type: "agent_removed"; agentId: string }
  | { type: "agent_updated"; agent: Agent }
  | { type: "event_added"; event: Event }
  | { type: "ping"; t: number };

// ──────────────────────────────────────────────────────────────────────────────
// Configuration constants — used by API and plugin
// ──────────────────────────────────────────────────────────────────────────────

/** Statuses considered "online" for the offline-detection counter. */
export const ONLINE_STATUSES: ReadonlyArray<AgentStatus> = [
  "IDLE",
  "WORKING",
  "THINKING",
  "TOOL",
  "WAITING",
  "COMPLETE",
];

/** Statuses that imply the agent is currently running a task. */
export const ACTIVE_STATUSES: ReadonlyArray<AgentStatus> = [
  "WORKING",
  "THINKING",
  "TOOL",
  "WAITING",
];

/** Event types that should also touch the Agent.currentStatus field. */
export const STATUS_BEARING_EVENTS: ReadonlyArray<EventType> = [
  "run_started",
  "run_completed",
  "run_failed",
  "thinking",
  "tool_started",
  "tool_completed",
  "tool_failed",
  "waiting",
  "status_changed",
  // Harness-independent lifecycle: incoming message / subagent spawn = WORKING,
  // outgoing reply / subagent end = IDLE.
  "message_received",
  "message_sent",
  "subagent_spawned",
  "subagent_ended",
];