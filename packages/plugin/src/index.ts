/**
 * OpenClaw Mission Control — native plugin entry.
 *
 * Implements the hook → spec-event mapping described in
 * packages/plugin/docs/hook-mapping.md. Every handler is total: it never
 * throws into OpenClaw's agent path.
 *
 * Configuration is read once at register time from `api.pluginConfig`. The
 * plugin emits a small registration event on `gateway_start` so the API
 * side can upsert the Agent row (idempotent on retry).
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { hostname as osHostname } from "node:os";
import {
  resolveConfig,
  type PluginConfig,
} from "./config.js";
import { createSender, type Sender, type SenderLogger } from "./sender.js";
import {
  mapAgentRunStart,
  mapAgentRunEnd,
  mapModelCallStart,
  mapToolStart,
  mapToolEnd,
  mapGatewayStart,
  mapGatewayStop,
  mapSessionEnd,
  mapSessionStart,
  mapMessageReceived,
  mapMessageSent,
  mapSubagentSpawned,
  mapSubagentEnded,
  mapCronReconciled,
  safeProviderFromContext,
  safeModelFromContext,
} from "./bridge.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeLogger(api: OpenClawPluginApi): SenderLogger {
  return {
    info: (msg, meta) => api.logger.info(`[mc] ${msg}`, meta),
    warn: (msg, meta) => api.logger.warn(`[mc] ${msg}`, meta),
    error: (msg, meta) => api.logger.error(`[mc] ${msg}`, meta),
    debug: (msg, meta) => api.logger.debug(`[mc] ${msg}`, meta),
  };
}

/**
 * OpenClaw plugin entry. Mounted by `definePluginEntry`.
 */
function entry(api: OpenClawPluginApi): void {
  const config = resolveConfig(api.pluginConfig ?? {});

  if (!config.agentId) {
    api.logger.warn(
      "[mc] agentId is empty — plugin will register hooks but emit nothing until configured",
    );
  }

  const logger = makeLogger(api);
  const sender: Sender = createSender({ config, logger });

  // Snapshot plugin identity to attach to every emitted event.
  //
  // Hostname fallback chain:
  //   1. process.env.HOSTNAME (set by systemd, Docker, kubelet, etc.)
  //   2. node:os.hostname() (the kernel's nodename — always non-empty on a real host)
  //   3. "unknown-host" (final guard so we never register `hostname: ""`)
  const state = {
    agentName: config.agentName || config.agentId || "openclaw-agent",
    hostname:
      (typeof process !== "undefined" &&
        process.env?.HOSTNAME &&
        process.env.HOSTNAME.trim()) ||
      (() => {
        try {
          const h = osHostname();
          return h && h.trim() ? h : undefined;
        } catch {
          return undefined;
        }
      })() ||
      "unknown-host",
    platform:
      typeof process !== "undefined"
        ? `${process.platform}/${process.arch}`
        : "unknown",
    openclawVersion: "openclaw-2026.9.2",
  };

  function safeEmit(payload: ReturnType<typeof mapAgentRunStart>): void {
    try {
      if (payload) sender.enqueue(payload);
    } catch (err) {
      api.logger.warn(`[mc] enqueue failed: ${(err as Error).message}`);
    }
  }

  function providerModel(event: any, ctx: any) {
    return {
      provider: safeProviderFromContext(event, ctx),
      model: safeModelFromContext(event, ctx),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  api.on("gateway_start", (_event: any, ctx: any) => {
    state.openclawVersion =
      (ctx?.config && (ctx.config as any)?.openclawVersion) ||
      (api.config as any)?.openclawVersion ||
      state.openclawVersion;
    safeEmit(mapGatewayStart(state, { ...ctx, runId: ctx?.runId, sessionId: ctx?.sessionId }));
    sender.start();
  });

  api.on("gateway_stop", (_event: any, ctx: any) => {
    safeEmit(mapGatewayStop(state, ctx));
    sender.stop();
  });

  api.on("session_start", (event: any, ctx: any) => {
    safeEmit(mapSessionStart(state, event, ctx));
  });

  api.on("session_end", (event: any, ctx: any) => {
    safeEmit(mapSessionEnd(state, event, ctx));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Agent turns
  // ──────────────────────────────────────────────────────────────────────────

  api.on("before_agent_run", (event: any, ctx: any) => {
    const { provider, model } = providerModel(event, ctx);
    safeEmit(mapAgentRunStart(state, event, { ...ctx, modelProviderId: provider, modelId: model }));
  });

  api.on("agent_end", (event: any, ctx: any) => {
    const { provider, model } = providerModel(event, ctx);
    safeEmit(mapAgentRunEnd(state, event, { ...ctx, modelProviderId: provider, modelId: model }));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Model calls → "thinking" events
  // ──────────────────────────────────────────────────────────────────────────

  api.on("model_call_started", (event: any, ctx: any) => {
    safeEmit(mapModelCallStart(state, event, ctx));
  });

  api.on("model_call_ended", () => {
    /* no-op: the next tool or end-hook tells us what happened */
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Tool calls
  // ──────────────────────────────────────────────────────────────────────────

  api.on("before_tool_call", (event: any, ctx: any) => {
    safeEmit(mapToolStart(state, event, ctx));
  });

  api.on("after_tool_call", (event: any, ctx: any) => {
    safeEmit(mapToolEnd(state, event, ctx));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Message + subagent + cron (harness-independent — fire on every runtime)
  // ──────────────────────────────────────────────────────────────────────────

  api.on("message_received", (event: any, ctx: any) => {
    safeEmit(mapMessageReceived(state, event, ctx));
  });

  api.on("message_sent", (event: any, ctx: any) => {
    safeEmit(mapMessageSent(state, event, ctx));
  });

  api.on("subagent_spawned", (event: any, ctx: any) => {
    safeEmit(mapSubagentSpawned(state, event, ctx));
  });

  api.on("subagent_ended", (event: any, ctx: any) => {
    safeEmit(mapSubagentEnded(state, event, ctx));
  });

  api.on("cron_reconciled", (event: any, ctx: any) => {
    safeEmit(mapCronReconciled(state, event, ctx));
  });

  api.logger.info(`[mc] registered: ${state.agentName} @ ${config.url}`);
}

const pluginEntry = definePluginEntry({
  id: "openclaw-mission-control",
  name: "Mission Control",
  description:
    "Streams sanitised agent lifecycle events to the Mission Control API.",
  register(api) {
    entry(api as unknown as OpenClawPluginApi);
  },
});

export default pluginEntry;
export { resolveConfig, createSender, entry };
export type { PluginConfig, Sender, SenderLogger };