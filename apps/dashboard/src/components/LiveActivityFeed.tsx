"use client";

/**
 * LiveActivityFeed — client component that renders the most recent activity
 * for one or all agents, with consecutive events of the same type aggregated
 * into a single row carrying a ×N count badge.
 *
 * Live data is sourced from <LiveStreamProvider> via the useEvents /
 * useAgents / useConnection hooks — the provider owns the single SSE
 * connection, this component just renders. SSR is satisfied by the
 * provider's initialAgents / initialEvents which come from the server.
 *
 * Behaviour:
 * - Events are filtered by the active tab ("all" or a single agentId),
 *   then optionally by the heartbeat toggle, then aggregated.
 * - A maximum of MAX_DISPLAY rows is rendered.
 * - New events (those not seen on the previous render) get a brief fade-in.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Agent,
  AgentStatus,
  Event,
  EventType,
} from "@openclaw-mc/shared";
import {
  eventDot,
  shortTime,
  statusColors,
  summarizeEvent,
} from "@/lib/format";
import {
  ActivityIcon,
  HeartbeatIcon,
  IdleIcon,
  RunCompleteIcon,
  RunFailedIcon,
  RunIcon,
  ThinkingIcon,
  ToolIcon,
  WaitingIcon,
  AgentIcon,
} from "@/components/icons";
import {
  useAgents,
  useConnection,
  useEvents,
} from "@/components/LiveStreamProvider";

interface Props {
  /** Optional buffer cap. Kept for API stability; provider owns the cap. */
  maxBuffer?: number;
}

interface AggregatedEntry {
  /** First event id in this aggregate — stable React key. */
  id: string;
  type: EventType;
  agentId: string;
  agentName: string;
  status: AgentStatus | null;
  activity: string | null;
  tool: string | null;
  firstTimestamp: string;
  lastTimestamp: string;
  /** Number of consecutive raw events that collapsed into this row. */
  count: number;
  /** True only for aggregates that were just created (triggers fade-in). */
  fresh: boolean;
}

const MAX_DISPLAY = 10;
const FRESH_FADE_MS = 700;

const TYPE_ICON: Record<string, React.ReactNode> = {
  agent_online: <AgentIcon className="h-3.5 w-3.5" />,
  agent_offline: <AgentIcon className="h-3.5 w-3.5" />,
  run_started: <RunIcon className="h-3.5 w-3.5" />,
  run_completed: <RunCompleteIcon className="h-3.5 w-3.5" />,
  run_failed: <RunFailedIcon className="h-3.5 w-3.5" />,
  thinking: <ThinkingIcon className="h-3.5 w-3.5" />,
  tool_started: <ToolIcon className="h-3.5 w-3.5" />,
  tool_completed: <RunCompleteIcon className="h-3.5 w-3.5" />,
  tool_failed: <RunFailedIcon className="h-3.5 w-3.5" />,
  waiting: <WaitingIcon className="h-3.5 w-3.5" />,
  heartbeat: <HeartbeatIcon className="h-3.5 w-3.5" />,
  status_changed: <IdleIcon className="h-3.5 w-3.5" />,
};

const TYPE_LABEL: Record<string, string> = {
  agent_online: "online",
  agent_offline: "offline",
  run_started: "started",
  run_completed: "completed",
  run_failed: "failed",
  thinking: "thinking",
  tool_started: "tool",
  tool_completed: "tool ok",
  tool_failed: "tool fail",
  waiting: "waiting",
  heartbeat: "heartbeat",
  status_changed: "status",
};

const ALL_TAB = "all";

function avatarColor(agentId: string): string {
  const palette = [
    "from-indigo-500/40 to-sky-500/40 text-indigo-200",
    "from-fuchsia-500/40 to-pink-500/40 text-fuchsia-200",
    "from-emerald-500/40 to-teal-500/40 text-emerald-200",
    "from-amber-500/40 to-orange-500/40 text-amber-200",
    "from-rose-500/40 to-red-500/40 text-rose-200",
    "from-violet-500/40 to-purple-500/40 text-violet-200",
    "from-cyan-500/40 to-blue-500/40 text-cyan-200",
  ];
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function avatarLetter(agentName: string): string {
  const trimmed = agentName.trim();
  if (!trimmed) return "?";
  const m = trimmed.match(/[a-zA-Z0-9]/);
  return (m?.[0] ?? trimmed[0]).toUpperCase();
}

function aggregateEvents(
  events: Event[],
  agentMap: Map<string, Agent>,
  max: number,
  freshIds: Set<string>,
): AggregatedEntry[] {
  const out: AggregatedEntry[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.type === e.type && last.agentId === e.agentId) {
      // Merge consecutive same-type events for the same agent.
      last.count += 1;
      last.lastTimestamp = e.timestamp;
      last.activity = e.activity ?? last.activity;
      last.tool = e.tool ?? last.tool;
      if (e.status) last.status = e.status;
      // Don't set fresh on merge — only on a NEW aggregate entry.
    } else {
      out.push({
        id: e.id,
        type: e.type,
        agentId: e.agentId,
        agentName: agentMap.get(e.agentId)?.name ?? e.agentId,
        status: e.status,
        activity: e.activity,
        tool: e.tool,
        firstTimestamp: e.timestamp,
        lastTimestamp: e.timestamp,
        count: 1,
        fresh: freshIds.has(e.id),
      });
    }
  }
  return out.slice(0, max);
}

export function LiveActivityFeed({ maxBuffer: _maxBuffer = 500 }: Props = {}) {
  // _maxBuffer kept for API stability; provider owns the actual cap.
  void _maxBuffer;

  const events = useEvents();
  const agents = useAgents();
  const connection = useConnection();

  const [tab, setTab] = useState<string>(ALL_TAB);
  const [hideHeartbeat, setHideHeartbeat] = useState<boolean>(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  // Hydrate the heartbeat filter preference from localStorage.
  // SSR-safe: defaults to false, then updates on mount (brief flash only).
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mc:hide-heartbeat");
      if (stored === "true") setHideHeartbeat(true);
    } catch {
      /* localStorage unavailable (private mode, etc.) */
    }
  }, []);

  // Track which event ids we've already announced as fresh.
  // When new ids appear in `events`, mark them fresh for FRESH_FADE_MS.
  const seenIdsRef = useRef<Set<string>>(new Set(events.map((e) => e.id)));

  useEffect(() => {
    const newIds: string[] = [];
    for (const e of events) {
      if (!seenIdsRef.current.has(e.id)) {
        newIds.push(e.id);
        seenIdsRef.current.add(e.id);
      }
    }
    if (newIds.length === 0) return;

    setFreshIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    const timeouts = newIds.map((id) =>
      setTimeout(() => {
        setFreshIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, FRESH_FADE_MS),
    );

    return () => {
      for (const t of timeouts) clearTimeout(t);
    };
  }, [events]);

  // Build a quick lookup from agents for the aggregator.
  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  // Strip heartbeats when the user has chosen to hide them.
  const visibleBuffer = useMemo(
    () =>
      hideHeartbeat ? events.filter((e) => e.type !== "heartbeat") : events,
    [events, hideHeartbeat],
  );

  // Per-agent raw event counts (used in tab badges).
  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL_TAB]: visibleBuffer.length };
    for (const e of visibleBuffer) {
      c[e.agentId] = (c[e.agentId] ?? 0) + 1;
    }
    return c;
  }, [visibleBuffer]);

  // Filter by active tab, then aggregate consecutive same-type events.
  const filtered = useMemo(
    () =>
      tab === ALL_TAB
        ? visibleBuffer
        : visibleBuffer.filter((e) => e.agentId === tab),
    [visibleBuffer, tab],
  );

  const aggregated = useMemo(
    () => aggregateEvents(filtered, agentMap, MAX_DISPLAY, freshIds),
    [filtered, agentMap, freshIds],
  );

  // Sorted agent list for the tab strip — online first, then alphabetical.
  const sortedAgents = useMemo(() => {
    return Array.from(agentMap.values()).sort((a, b) => {
      const aOnline = a.currentStatus !== "OFFLINE" ? 0 : 1;
      const bOnline = b.currentStatus !== "OFFLINE" ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.name.localeCompare(b.name);
    });
  }, [agentMap]);

  const connectionBadge = useMemo(() => {
    if (connection === "open") {
      return (
        <span className="mc-pill bg-emerald-500/10 text-emerald-200 ring-emerald-500/30">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 fox-pulse" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          live
        </span>
      );
    }
    if (connection === "connecting") {
      return (
        <span className="mc-pill bg-amber-500/10 text-amber-200 ring-amber-500/30">
          <span className="h-2 w-2 rounded-full bg-amber-400 fox-blink" />
          connecting
        </span>
      );
    }
    return (
      <span className="mc-pill bg-rose-500/10 text-rose-200 ring-rose-500/30">
        <span className="h-2 w-2 rounded-full bg-rose-400" />
        offline
      </span>
    );
  }, [connection]);

  return (
    <div className="mc-card overflow-hidden">
      {/* Tab strip — "All" + one tab per agent. */}
      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-ink-800/80 px-2 py-2 sm:px-3"
        role="tablist"
        aria-label="Filter live activity by agent"
      >
        <TabButton
          active={tab === ALL_TAB}
          onClick={() => setTab(ALL_TAB)}
          icon={<ActivityIcon className="h-3 w-3" />}
          label="All"
          count={counts[ALL_TAB] ?? 0}
        />
        {sortedAgents.map((a) => {
          const dot = statusColors(a.currentStatus).dot;
          return (
            <TabButton
              key={a.id}
              active={tab === a.id}
              onClick={() => setTab(a.id)}
              icon={<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
              label={a.name}
              count={counts[a.id] ?? 0}
            />
          );
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-800/80 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2 text-sm">
          <ActivityIcon className="h-4 w-4 text-ink-400" />
          <span className="text-ink-200">
            <span className="font-medium">{aggregated.length}</span>{" "}
            <span className="text-ink-500">
              aggregated row{aggregated.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink-700"> · </span>
            <span className="text-ink-500">
              <span className="font-mono text-ink-300">{filtered.length}</span>{" "}
              raw event{filtered.length === 1 ? "" : "s"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={hideHeartbeat}
            aria-label={hideHeartbeat ? "Show heartbeats" : "Hide heartbeats"}
            title={
              hideHeartbeat
                ? "Heartbeats hidden — click to show"
                : "Hide heartbeats"
            }
            onClick={() => {
              const next = !hideHeartbeat;
              setHideHeartbeat(next);
              try {
                localStorage.setItem("mc:hide-heartbeat", String(next));
              } catch {
                /* localStorage unavailable */
              }
            }}
            className={`mc-pill transition-colors ${
              hideHeartbeat
                ? "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-500/40 hover:bg-fuchsia-500/25"
                : "bg-ink-800/40 text-ink-400 ring-ink-700/30 hover:bg-ink-800/60 hover:text-ink-200"
            }`}
          >
            <HeartbeatIcon className="h-3 w-3" />
            <span className="hidden text-[10px] font-medium sm:inline">
              {hideHeartbeat ? "hb off" : "hb"}
            </span>
          </button>
          {connectionBadge}
        </div>
      </div>

      {/* Aggregated list */}
      <ul className="mc-scroll divide-y divide-ink-800/60">
        {aggregated.length === 0 ? (
          <li className="px-4 py-12 text-center text-sm text-ink-500">
            No activity yet for{" "}
            <span className="text-ink-300">
              {tab === ALL_TAB ? "any agent" : agentMap.get(tab)?.name ?? tab}
            </span>
            .
            <p className="mt-1 text-xs text-ink-600">
              Events appear here as agents heartbeat, run tasks, and call tools.
            </p>
          </li>
        ) : (
          aggregated.map((entry) => {
            const colors = eventColor(entry.type);
            const typeLabel = TYPE_LABEL[entry.type] ?? entry.type;
            const typeIcon = TYPE_ICON[entry.type] ?? (
              <ActivityIcon className="h-3.5 w-3.5" />
            );
            const status = entry.status ? statusColors(entry.status) : null;
            const activity = summarizeEvent(entry.activity, entry.tool);
            return (
              <li
                key={entry.id}
                className={`flex items-center gap-3 px-4 py-2.5 sm:px-5 ${
                  entry.fresh ? "mc-fade-in" : ""
                }`}
              >
                {/* ×N count badge on the LEFT — prominent when > 1. */}
                <div className="flex h-9 w-12 shrink-0 items-center justify-center">
                  {entry.count > 1 ? (
                    <div className="flex h-full w-full items-center justify-center rounded-lg bg-fuchsia-500/15 ring-1 ring-fuchsia-500/30">
                      <span className="text-base font-bold tabular-nums text-fuchsia-200">
                        ×{entry.count}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-700" aria-hidden>
                      ·
                    </span>
                  )}
                </div>

                {/* Agent avatar */}
                <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ring-1 ring-white/5">
                  <span
                    className={`absolute inset-0 rounded-full bg-gradient-to-br ${avatarColor(
                      entry.agentId,
                    )} opacity-60`}
                  />
                  <span className="relative text-[11px] font-semibold">
                    {avatarLetter(entry.agentName)}
                  </span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}
                    >
                      <span className={colors.iconText}>{typeIcon}</span>
                      {typeLabel}
                    </span>
                    <span className="truncate text-sm text-ink-100">
                      {entry.agentName}
                    </span>
                    {status ? (
                      <span
                        className={`mc-pill text-[10px] ${status.bg} ${status.text} ${status.ring}`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${status.dot}`}
                        />
                        {entry.status}
                      </span>
                    ) : null}
                    {entry.count > 1 ? (
                      <span className="font-mono text-[10px] text-ink-600">
                        {shortTime(entry.firstTimestamp)} →{" "}
                        {shortTime(entry.lastTimestamp)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-400">
                    {activity || "—"}
                  </p>
                </div>

                <span className="shrink-0 font-mono text-[11px] text-ink-500">
                  {shortTime(entry.lastTimestamp)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
        active
          ? "bg-ink-800/80 text-ink-50 ring-ink-700/40"
          : "bg-ink-900/40 text-ink-400 ring-ink-800/30 hover:bg-ink-800/40 hover:text-ink-200"
      }`}
    >
      <span
        className={`flex h-3 w-3 items-center justify-center ${
          active ? "text-ink-200" : "text-ink-500"
        }`}
      >
        {icon}
      </span>
      <span className="max-w-[10rem] truncate">{label}</span>
      <span
        className={`font-mono text-[10px] tabular-nums ${
          active ? "text-ink-400" : "text-ink-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function eventColor(type: string) {
  const dot = eventDot(type);
  const map: Record<
    string,
    { bg: string; text: string; ring: string; iconText: string }
  > = {
    "bg-emerald-400": {
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
      ring: "ring-emerald-500/30",
      iconText: "text-emerald-300",
    },
    "bg-ink-500": {
      bg: "bg-ink-800/60",
      text: "text-ink-300",
      ring: "ring-ink-700/40",
      iconText: "text-ink-400",
    },
    "bg-amber-400": {
      bg: "bg-amber-500/10",
      text: "text-amber-200",
      ring: "ring-amber-500/30",
      iconText: "text-amber-300",
    },
    "bg-rose-400": {
      bg: "bg-rose-500/10",
      text: "text-rose-200",
      ring: "ring-rose-500/30",
      iconText: "text-rose-300",
    },
    "bg-sky-400": {
      bg: "bg-sky-500/10",
      text: "text-sky-200",
      ring: "ring-sky-500/30",
      iconText: "text-sky-300",
    },
    "bg-indigo-400": {
      bg: "bg-indigo-500/10",
      text: "text-indigo-200",
      ring: "ring-indigo-500/30",
      iconText: "text-indigo-300",
    },
    "bg-fuchsia-400": {
      bg: "bg-fuchsia-500/10",
      text: "text-fuchsia-200",
      ring: "ring-fuchsia-500/30",
      iconText: "text-fuchsia-300",
    },
    "bg-ink-400": {
      bg: "bg-ink-800/60",
      text: "text-ink-300",
      ring: "ring-ink-700/40",
      iconText: "text-ink-400",
    },
    "bg-amber-300": {
      bg: "bg-amber-500/10",
      text: "text-amber-200",
      ring: "ring-amber-500/30",
      iconText: "text-amber-300",
    },
  };
  return (
    map[dot] ?? {
      bg: "bg-ink-800/60",
      text: "text-ink-300",
      ring: "ring-ink-700/40",
      iconText: "text-ink-400",
    }
  );
}
