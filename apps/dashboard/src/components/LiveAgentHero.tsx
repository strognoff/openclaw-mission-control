"use client";

/**
 * LiveAgentHero — client wrapper for the per-agent page header.
 *
 * Reads the live agent record from <LiveStreamProvider> so the status pill,
 * current task/activity/tool, and "last heartbeat" fields update without
 * a page reload whenever a new SSE event arrives for this agent.
 *
 * Falls back to the server-rendered `initialAgent` if the provider doesn't
 * have the record (e.g. SSE not connected yet, or the agent was removed
 * upstream).
 */

import type { Agent } from "@openclaw-mc/shared";
import { ClientTime } from "@/components/ClientTime";
import {
  durationHuman,
  isOnlineStatus,
  statusColors,
} from "@/lib/format";
import { useAgent } from "@/components/LiveStreamProvider";

export interface RunSummary {
  id: string;
  status: string;
  durationMs: number | null;
  toolCallCount: number;
  errorSummary: string | null;
}

interface Props {
  initialAgent: Agent;
  lastRun: RunSummary | null;
}

export function LiveAgentHero({ initialAgent, lastRun }: Props) {
  const live = useAgent(initialAgent.id) ?? initialAgent;
  const colors = statusColors(live.currentStatus);
  const online = isOnlineStatus(live.currentStatus);

  return (
    <header className="mc-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦊</span>
            <div>
              <h1 className="text-2xl font-semibold text-ink-50">
                {live.name}
              </h1>
              <p className="font-mono text-xs text-ink-500">{live.id}</p>
            </div>
          </div>
        </div>
        <span
          className={`mc-pill self-start text-sm ${colors.bg} ${colors.text} ${colors.ring}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${colors.dot} ${online ? "fox-blink" : ""}`}
            aria-hidden
          />
          {live.currentStatus}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Task" value={live.currentTask ?? "—"} />
        <Field label="Activity" value={live.currentActivity ?? "—"} />
        <Field label="Tool" value={live.currentTool ?? "—"} />
        <Field
          label="Provider / model"
          value={
            live.provider || live.model
              ? `${live.provider ?? "?"}/${live.model ?? "?"}`
              : "—"
          }
        />
        <Field label="Host" value={live.hostname} />
        <Field label="Platform" value={live.platform} />
        <Field label="OpenClaw" value={live.openclawVersion} />
        <Field
          label="Last heartbeat"
          value={<ClientTime iso={live.lastHeartbeat} />}
        />
        {lastRun ? (
          <>
            <Field label="Last run id" value={lastRun.id} mono />
            <Field
              label="Last run status"
              value={`${lastRun.status} · ${durationHuman(lastRun.durationMs)}`}
            />
            <Field
              label="Last run tool calls"
              value={String(lastRun.toolCallCount)}
            />
            {lastRun.errorSummary ? (
              <Field label="Last error" value={lastRun.errorSummary} />
            ) : (
              <Field label="Last seen" value={<ClientTime iso={live.lastSeen} />} />
            )}
          </>
        ) : (
          <Field label="Last seen" value={<ClientTime iso={live.lastSeen} />} />
        )}
      </dl>
    </header>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm text-ink-100 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
