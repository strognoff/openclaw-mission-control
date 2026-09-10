"use client";

/**
 * LiveActivityFeed — client component that opens the SSE stream and keeps
 * a rolling list of the most recent events across all agents.
 *
 * - Server provides the initial 30 events so the page is meaningful before
 *   the first SSE message arrives.
 * - SSE messages patch the list in place with a fade-in animation.
 * - Failed connections retry with exponential backoff up to 30s.
 */

import { useEffect, useMemo, useState } from "react";
import type { Agent, Event, SseMessage, EventType } from "@openclaw-mc/shared";
import { eventDot, shortTime, statusColors, summarizeEvent } from "@/lib/format";
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

interface Props {
  initialEvents: Event[];
  agents: Agent[];
  streamUrl: string;
}

interface FeedEntry {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  type: EventType | string;
  status: string | null;
  activity: string;
  fresh: boolean;
}

const MAX_FEED = 50;

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
  // Prefer first alphanumeric char; fall back to first character.
  const m = trimmed.match(/[a-zA-Z0-9]/);
  return (m?.[0] ?? trimmed[0]).toUpperCase();
}

export function LiveActivityFeed({ initialEvents, agents, streamUrl }: Props) {
  const [entries, setEntries] = useState<FeedEntry[]>(() =>
    initialEvents.map((e) => ({ ...toEntry(e, agents), fresh: false })),
  );
  const [agentMap, setAgentMap] = useState<Map<string, Agent>>(
    () => new Map(agents.map((a) => [a.id, a])),
  );
  const [connection, setConnection] = useState<
    "connecting" | "open" | "closed"
  >("connecting");

  useEffect(() => {
    let es: EventSource | null = null;
    let retryMs = 1_000;
    let cancelled = false;

    function open() {
      if (cancelled) return;
      es = new EventSource(streamUrl);
      setConnection("connecting");
      es.addEventListener("hello", () => setConnection("open"));
      es.addEventListener("open", () => setConnection("open"));
      for (const evt of [
        "event_added",
        "agent_added",
        "agent_updated",
        "agent_removed",
      ] as const) {
        es.addEventListener(evt, (ev) => {
          try {
            const msg = JSON.parse((ev as MessageEvent).data) as SseMessage;
            handleMessage(msg);
          } catch {
            /* ignore parse errors */
          }
        });
      }
      es.addEventListener("error", () => {
        es?.close();
        es = null;
        setConnection("closed");
        const wait = Math.min(retryMs, 30_000);
        retryMs = Math.min(retryMs * 2, 30_000);
        setTimeout(() => {
          if (!cancelled) open();
        }, wait);
      });
    }

    function handleMessage(msg: SseMessage) {
      if (msg.type === "event_added") {
        const agent = agentMap.get(msg.event.agentId);
        const entry = {
          ...toEntry(msg.event, agent ? [agent] : Array.from(agentMap.values())),
          fresh: true,
        };
        setEntries((prev) => [entry, ...prev].slice(0, MAX_FEED));
        // Clear the `fresh` flag after the animation so re-renders don't replay it.
        setTimeout(() => {
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, fresh: false } : e)),
          );
        }, 400);
      } else if (msg.type === "agent_added" || msg.type === "agent_updated") {
        setAgentMap((prev) => {
          const next = new Map(prev);
          next.set(msg.agent.id, msg.agent);
          return next;
        });
      } else if (msg.type === "agent_removed") {
        setAgentMap((prev) => {
          const next = new Map(prev);
          next.delete(msg.agentId);
          return next;
        });
      }
    }

    open();
    return () => {
      cancelled = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl]);

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
      <div className="flex items-center justify-between gap-3 border-b border-ink-800/80 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-sm">
          <ActivityIcon className="h-4 w-4 text-ink-400" />
          <span className="text-ink-200">
            <span className="font-medium">{entries.length}</span>{" "}
            <span className="text-ink-500">recent events</span>
          </span>
        </div>
        {connectionBadge}
      </div>

      <ul className="mc-scroll divide-y divide-ink-800/60">
        {entries.length === 0 ? (
          <li className="px-4 py-12 text-center text-sm text-ink-500">
            No activity yet.
            <p className="mt-1 text-xs text-ink-600">
              Events appear here as agents heartbeat, run tasks, and call tools.
            </p>
          </li>
        ) : (
          entries.map((entry) => {
            const colors = eventColor(entry.type);
            const typeLabel = TYPE_LABEL[entry.type] ?? entry.type;
            const typeIcon = TYPE_ICON[entry.type] ?? (
              <ActivityIcon className="h-3.5 w-3.5" />
            );
            const status = entry.status ? statusColors(entry.status) : null;
            return (
              <li
                key={entry.id}
                className={`flex items-center gap-3 px-4 py-2.5 sm:px-5 ${
                  entry.fresh ? "mc-fade-in" : ""
                }`}
              >
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

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                        <span className={`h-1 w-1 rounded-full ${status.dot}`} />
                        {entry.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-400">
                    {entry.activity}
                  </p>
                </div>

                <span className="hidden shrink-0 font-mono text-[11px] text-ink-500 sm:inline">
                  {shortTime(entry.timestamp)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function eventColor(type: string) {
  const dot = eventDot(type);
  // Map dot class → a small chip palette. This keeps consistency with
  // existing event semantics without duplicating the colour map.
  const map: Record<string, { bg: string; text: string; ring: string; iconText: string }> = {
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

function toEntry(
  event: Event,
  agents: Agent[],
): Omit<FeedEntry, "fresh"> {
  const agent = agents.find((a) => a.id === event.agentId);
  return {
    id: event.id,
    timestamp: event.timestamp,
    agentId: event.agentId,
    agentName: agent?.name ?? event.agentId,
    type: event.type,
    status: event.status,
    activity: summarizeEvent(event.activity, event.tool),
  };
}
