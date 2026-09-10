/**
 * AgentCard — compact card showing one agent's live state.
 *
 * Server-rendered. Real-time updates come from the page-level SSE feed
 * which patches the parent. We keep this as a presentational component so
 * the live updates can swap the React tree.
 */

import Link from "next/link";
import type { Agent } from "@openclaw-mc/shared";
import { durationHuman, isOnlineStatus, relativeTime, statusColors } from "@/lib/format";

interface AgentCardProps {
  agent: Agent;
  /** Set when the SSE feed has fresh activity; renders the live badge. */
  livePulse?: boolean;
}

export function AgentCard({ agent, livePulse }: AgentCardProps) {
  const colors = statusColors(agent.currentStatus);
  const online = isOnlineStatus(agent.currentStatus);
  // Estimate run duration from the time since the agent's last activity.
  // Cheap heuristic: lastSeen - createdAt as a rough proxy until we have
  // proper run start/end times.
  const lastSeenMs = new Date(agent.lastSeen).getTime() - new Date(agent.updatedAt).getTime();
  const runningFor = lastSeenMs > 0 ? durationHuman(lastSeenMs) : "—";

  return (
    <Link
      href={`/${encodeURIComponent(agent.id)}`}
      className="mc-card mc-card-hover group block p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink-50">
            {agent.name}
          </p>
          <p className="truncate font-mono text-xs text-ink-500">
            {agent.id}
          </p>
        </div>
        <span className={`mc-pill ${colors.bg} ${colors.text} ${colors.ring}`}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${colors.dot} ${
              online && livePulse ? "fox-blink" : ""
            }`}
            aria-hidden
          />
          {agent.currentStatus}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-ink-500">Task</dt>
          <dd className="mt-0.5 truncate text-ink-200">
            {agent.currentTask ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Activity</dt>
          <dd className="mt-0.5 truncate text-ink-200">
            {agent.currentTool ?? agent.currentActivity ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Host</dt>
          <dd className="mt-0.5 truncate font-mono text-ink-300">
            {agent.hostname}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Model</dt>
          <dd className="mt-0.5 truncate text-ink-300">
            {agent.provider ? `${agent.provider}/` : ""}
            {agent.model ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Last heartbeat</dt>
          <dd className="mt-0.5 text-ink-200">
            {relativeTime(agent.lastHeartbeat)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Running</dt>
          <dd className="mt-0.5 text-ink-200">{runningFor}</dd>
        </div>
      </dl>
    </Link>
  );
}