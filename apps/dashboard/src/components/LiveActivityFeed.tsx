"use client";

/**
 * LiveActivityFeed — client component that opens the SSE stream and keeps
 * a rolling list of the most recent events across all agents.
 *
 * - Server provides the initial 30 events so the page is meaningful before
 *   the first SSE message arrives.
 * - SSE messages patch the list in place.
 * - Failed connections retry with exponential backoff up to 30s.
 */

import { useEffect, useMemo, useState } from "react";
import type { Agent, Event, SseMessage } from "@openclaw-mc/shared";
import {
  eventDot,
  isOnlineStatus,
  relativeTime,
  shortTime,
  statusColors,
  summarizeEvent,
} from "@/lib/format";

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
  type: string;
  status: string | null;
  activity: string;
}

const MAX_FEED = 50;

export function LiveActivityFeed({ initialEvents, agents, streamUrl }: Props) {
  const [entries, setEntries] = useState<FeedEntry[]>(() =>
    initialEvents.map((e) => toEntry(e, agents)),
  );
  const [agentMap, setAgentMap] = useState<Map<string, Agent>>(
    () => new Map(agents.map((a) => [a.id, a])),
  );
  const [connection, setConnection] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );

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
      es.addEventListener("error", () => setConnection("closed"));
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
      // Reconnect on close.
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
        const entry = toEntry(
          msg.event,
          agent ? [agent] : Array.from(agentMap.values()),
        );
        setEntries((prev) => [entry, ...prev].slice(0, MAX_FEED));
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
      // ping → no-op
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
          <span className="h-2 w-2 rounded-full bg-emerald-400 fox-blink" /> live
        </span>
      );
    }
    if (connection === "connecting") {
      return (
        <span className="mc-pill bg-amber-500/10 text-amber-200 ring-amber-500/30">
          <span className="h-2 w-2 rounded-full bg-amber-400 fox-blink" /> connecting
        </span>
      );
    }
    return (
      <span className="mc-pill bg-rose-500/10 text-rose-200 ring-rose-500/30">
        <span className="h-2 w-2 rounded-full bg-rose-400" /> offline
      </span>
    );
  }, [connection]);

  return (
    <div className="mc-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
        <p className="text-sm text-ink-300">
          {entries.length} recent events
        </p>
        {connectionBadge}
      </div>
      <ul className="divide-y divide-ink-800/60">
        {entries.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-ink-500">
            No activity yet.
          </li>
        ) : (
          entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${eventDot(entry.type)}`}
                aria-hidden
              />
              <span className="w-20 shrink-0 font-mono text-xs text-ink-500">
                {shortTime(entry.timestamp)}
              </span>
              <span className="w-32 shrink-0 truncate text-ink-200">
                {entry.agentName}
              </span>
              <span className="flex-1 truncate text-ink-300">
                {entry.activity}
              </span>
              {entry.status ? (
                <span
                  className={`mc-pill text-[10px] ${statusColors(entry.status).bg} ${statusColors(entry.status).text} ${statusColors(entry.status).ring}`}
                >
                  {entry.status}
                </span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function toEntry(event: Event, agents: Agent[]): FeedEntry {
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