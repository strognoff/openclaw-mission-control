"use client";

/**
 * LiveStreamProvider — single shared SSE connection for the dashboard.
 *
 * Owns the EventSource and exposes:
 *   - agents: latest list (patched by agent_added / agent_updated / agent_removed)
 *   - events: rolling buffer (patched by event_added)
 *   - connection: 'connecting' | 'open' | 'closed'
 *   - lastMessageAt: wall-clock ms of the most recent SSE message
 *
 * Used by:
 *   - HeroStrip, SummarySection, AgentsSection on the overview page
 *   - LiveAgentHero, LiveActivityFeed on the per-agent page
 *
 * The provider mounts ONE EventSource per page, regardless of how many
 * consumers read from it. The previous design had LiveActivityFeed open
 * its own connection — that left the cards and summary tiles stale.
 *
 * SSR-safe: provider renders its children immediately with the initial
 * server-fetched data, then the SSE connection opens in an effect.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Agent, Event, SseMessage } from "@openclaw-mc/shared";

const MAX_EVENTS = 500;

export type ConnectionState = "connecting" | "open" | "closed";

export interface LiveStreamState {
  agents: Agent[];
  events: Event[];
  connection: ConnectionState;
  lastMessageAt: number | null;
}

const LiveStreamContext = createContext<LiveStreamState | null>(null);

interface ProviderProps {
  initialAgents: Agent[];
  initialEvents: Event[];
  streamUrl: string;
  children: React.ReactNode;
}

export function LiveStreamProvider({
  initialAgents,
  initialEvents,
  streamUrl,
  children,
}: ProviderProps) {
  const [agents, setAgents] = useState<Map<string, Agent>>(
    () => new Map(initialAgents.map((a) => [a.id, a])),
  );
  const [events, setEvents] = useState<Event[]>(() =>
    initialEvents.slice(0, MAX_EVENTS),
  );
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  // SSE — exponential backoff reconnect (capped at 30s).
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
            setLastMessageAt(Date.now());
            handleMessage(msg);
          } catch {
            /* ignore malformed messages */
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
        setEvents((prev) => [msg.event, ...prev].slice(0, MAX_EVENTS));
      } else if (msg.type === "agent_added" || msg.type === "agent_updated") {
        setAgents((prev) => {
          const next = new Map(prev);
          next.set(msg.agent.id, msg.agent);
          return next;
        });
      } else if (msg.type === "agent_removed") {
        setAgents((prev) => {
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
  }, [streamUrl]);

  const value = useMemo<LiveStreamState>(
    () => ({
      agents: Array.from(agents.values()),
      events,
      connection,
      lastMessageAt,
    }),
    [agents, events, connection, lastMessageAt],
  );

  return (
    <LiveStreamContext.Provider value={value}>
      {children}
    </LiveStreamContext.Provider>
  );
}

export function useLiveStream(): LiveStreamState {
  const ctx = useContext(LiveStreamContext);
  if (!ctx) {
    throw new Error(
      "useLiveStream must be used within a <LiveStreamProvider>",
    );
  }
  return ctx;
}

export function useAgents(): Agent[] {
  return useLiveStream().agents;
}

export function useEvents(): Event[] {
  return useLiveStream().events;
}

export function useConnection(): ConnectionState {
  return useLiveStream().connection;
}

export function useAgent(id: string): Agent | undefined {
  const { agents } = useLiveStream();
  return useMemo(() => agents.find((a) => a.id === id), [agents, id]);
}
