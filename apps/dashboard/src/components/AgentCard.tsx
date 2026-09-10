/**
 * AgentCard — compact card showing one agent's live state.
 *
 * Server-rendered. Real-time updates come from the page-level SSE feed
 * which patches the parent. We keep this as a presentational component so
 * the live updates can swap the React tree.
 */

import Link from "next/link";
import type { Agent } from "@openclaw-mc/shared";
import {
  durationHuman,
  isOnlineStatus,
  relativeTime,
  statusColors,
} from "@/lib/format";
import {
  ArrowRightIcon,
  ChipIcon,
  HeartbeatIcon,
  ServerIcon,
  WorkingIcon,
} from "@/components/icons";

interface AgentCardProps {
  agent: Agent;
  /** Set when the SSE feed has fresh activity; renders the live badge. */
  livePulse?: boolean;
}

export function AgentCard({ agent, livePulse }: AgentCardProps) {
  const colors = statusColors(agent.currentStatus);
  const online = isOnlineStatus(agent.currentStatus);
  // Estimate run duration from the time since the agent's last activity.
  const lastSeenMs = new Date(agent.lastSeen).getTime() - new Date(agent.updatedAt).getTime();
  const runningFor = lastSeenMs > 0 ? durationHuman(lastSeenMs) : "—";

  const statusIcon = (() => {
    switch (agent.currentStatus) {
      case "WORKING":
      case "THINKING":
      case "TOOL":
      case "WAITING":
        return <WorkingIcon className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  })();

  return (
    <Link
      href={`/${encodeURIComponent(agent.id)}`}
      className="mc-card mc-card-hover group block p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold text-ink-50">
              {agent.name}
            </p>
            {livePulse && online ? (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 fox-blink"
              />
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-ink-500">
            {agent.id}
          </p>
        </div>
        <span
          className={`mc-pill ${colors.bg} ${colors.text} ${colors.ring}`}
        >
          {statusIcon}
          <span
            className={`h-1.5 w-1.5 rounded-full ${colors.dot} ${
              online && livePulse ? "fox-blink" : ""
            }`}
            aria-hidden
          />
          {agent.currentStatus}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
        <Metric
          icon={<ServerIcon className="h-3.5 w-3.5" />}
          label="Host"
          value={
            <span className="font-mono text-ink-300">
              {agent.hostname || "—"}
            </span>
          }
        />
        <Metric
          icon={<ChipIcon className="h-3.5 w-3.5" />}
          label="Model"
          value={
            <span className="truncate text-ink-300">
              {agent.provider ? `${agent.provider}/` : ""}
              {agent.model ?? "—"}
            </span>
          }
        />
        <Metric
          icon={<HeartbeatIcon className="h-3.5 w-3.5" />}
          label="Last beat"
          value={<span className="text-ink-200">{relativeTime(agent.lastHeartbeat)}</span>}
        />
        <Metric
          label="Task"
          value={
            <span className="truncate text-ink-200" title={agent.currentTask ?? ""}>
              {agent.currentTask ?? "—"}
            </span>
          }
        />
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-ink-800/60 pt-3">
        <span className="text-[11px] text-ink-500">
          {agent.currentTool ?? agent.currentActivity ?? (
            <span className="text-ink-600">idle</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 transition-colors group-hover:text-indigo-300">
          running {runningFor}
          <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm">{value}</dd>
    </div>
  );
}
