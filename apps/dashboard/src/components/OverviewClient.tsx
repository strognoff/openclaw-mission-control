"use client";

/**
 * OverviewClient — client-side sections for the overview page.
 *
 * Each component reads live data from <LiveStreamProvider> via hooks, so
 * the hero status, summary tiles, and agent cards update without a page
 * reload whenever a new SSE event arrives.
 */

import { useEffect, useMemo, useState } from "react";
import type { Agent } from "@openclaw-mc/shared";
import {
  bucketEventsToday,
  isOnlineStatus,
} from "@/lib/format";
import { ClientTime } from "@/components/ClientTime";
import { AgentCard } from "@/components/AgentCard";
import { SummaryTiles } from "@/components/SummaryTiles";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import {
  useAgents,
  useEvents,
  useLiveStream,
} from "@/components/LiveStreamProvider";
import { OnlineIcon, OfflineIcon, ServerIcon } from "@/components/icons";

const WORKING_STATUSES = ["WORKING", "THINKING", "TOOL", "WAITING"];

function computeStats(agents: Agent[]) {
  const online = agents.filter((a) => isOnlineStatus(a.currentStatus)).length;
  const offline = agents.filter((a) => a.currentStatus === "OFFLINE").length;
  const working = agents.filter((a) =>
    WORKING_STATUSES.includes(a.currentStatus),
  ).length;
  const idle = agents.filter((a) => a.currentStatus === "IDLE").length;
  const errored = agents.filter((a) => a.currentStatus === "ERROR").length;
  return { online, offline, working, idle, errored };
}

export function HeroStrip() {
  const agents = useAgents();
  const { lastMessageAt } = useLiveStream();
  const { online, offline, working, idle, errored } = useMemo(
    () => computeStats(agents),
    [agents],
  );

  return (
    <section className="mc-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            {online > 0 ? (
              <OnlineIcon className="h-6 w-6 text-emerald-300" />
            ) : (
              <OfflineIcon className="h-6 w-6 text-ink-400" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink-50">
              {online > 0
                ? `${online} agent${online === 1 ? "" : "s"} online`
                : offline > 0
                  ? `All ${offline} agent${offline === 1 ? "" : "s"} offline`
                  : "No agents yet"}
            </h2>
            <p className="mt-0.5 text-sm text-ink-400">
              {working > 0
                ? `${working} working · ${idle} idle · ${errored} in error`
                : idle > 0
                  ? `${idle} idle and heartbeating`
                  : offline > 0
                    ? "Awaiting first heartbeat from a registered agent."
                    : "Mint a key from the Keys page and the bot will register itself on first heartbeat."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-ink-400">
            <ServerIcon className="h-4 w-4" />
            <span className="font-mono text-xs text-ink-300">
              {agents.length} registered
            </span>
          </div>
          <div className="text-xs text-ink-500">
            <span className="hidden sm:inline">last update </span>
            <span className="font-mono text-ink-300">
              {lastMessageAt ? (
                <ClientTime iso={new Date(lastMessageAt).toISOString()} />
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SummarySection() {
  const agents = useAgents();
  const events = useEvents();
  const { lastMessageAt } = useLiveStream();

  const { online, offline, working, idle, errored } = useMemo(
    () => computeStats(agents),
    [agents],
  );

  // bucketEventsToday calls Date.now()/new Date() in pure functions — running
  // it during render produces mismatched SSR vs client output (server time
  // vs browser time). Defer until after hydration via a `hydrated` flag.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const todays = useMemo(
    () =>
      hydrated
        ? events.filter((e) => bucketEventsToday.isToday(e.timestamp))
        : [],
    [events, hydrated],
  );
  const tasksToday = useMemo(
    () =>
      todays.filter(
        (e) => e.type === "run_started" || e.type === "run_completed",
      ).length,
    [todays],
  );
  const failedToday = useMemo(
    () =>
      todays.filter(
        (e) => e.type === "run_failed" || e.type === "tool_failed",
      ).length,
    [todays],
  );
  const toolCallsToday = useMemo(
    () =>
      todays.filter(
        (e) => e.type === "tool_started" || e.type === "tool_completed",
      ).length,
    [todays],
  );
  const hourlyBuckets = useMemo(
    () =>
      hydrated
        ? bucketEventsToday.hourly(todays, 12)
        : new Array(12).fill(0),
    [todays, hydrated],
  );

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h3 className="mc-section-title">Overview</h3>
        <p className="text-[11px] text-ink-600">
          Updated{" "}
          {lastMessageAt ? (
            <ClientTime iso={new Date(lastMessageAt).toISOString()} />
          ) : (
            "—"
          )}
        </p>
      </div>
      <SummaryTiles
        online={online}
        working={working}
        idle={idle}
        offline={offline}
        tasksToday={tasksToday}
        failedToday={failedToday}
        toolCallsToday={toolCallsToday}
        errored={errored}
        hourlyTasks={hourlyBuckets}
      />
    </section>
  );
}

export function AgentsSection() {
  const agents = useAgents();
  const { online: onlineCount, offline: offlineCount } = useMemo(
    () => computeStats(agents),
    [agents],
  );

  // Split agents into online/offline for rendering.
  // Recomputes on every SSE update — an agent that just went offline moves
  // from the top grid into the collapsed section automatically.
  const { onlineAgents, offlineAgents } = useMemo(() => {
    const online: Agent[] = [];
    const offline: Agent[] = [];
    for (const a of agents) {
      if (a.currentStatus === "OFFLINE") {
        offline.push(a);
      } else {
        online.push(a);
      }
    }
    return { onlineAgents: online, offlineAgents: offline };
  }, [agents]);

  // Collapse state for the offline section — persisted to localStorage.
  // SSR-safe: defaults to collapsed, then updates on mount (brief flash).
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mc:show-offline");
      if (stored === "true") setShowOffline(true);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  if (agents.length === 0) {
    return (
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="mc-section-title">Agents</h3>
          <p className="text-[11px] text-ink-600">0 total · 0 online</p>
        </div>
        <EmptyAgentsCard />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h3 className="mc-section-title">Agents</h3>
        <p className="text-[11px] text-ink-600">
          {agents.length} total · {onlineCount} online
          {offlineCount > 0 ? ` · ${offlineCount} offline` : ""}
        </p>
      </div>

      {/* Online agents — always visible */}
      {onlineAgents.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {onlineAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : null}

      {/* Offline agents — collapsed by default */}
      {offlineAgents.length > 0 ? (
        <details
          className="group mt-4 overflow-hidden rounded-xl border border-ink-800/80 bg-ink-950/40"
          open={showOffline}
          onToggle={(e) => {
            const isOpen = (e.target as HTMLDetailsElement).open;
            setShowOffline(isOpen);
            try {
              localStorage.setItem("mc:show-offline", String(isOpen));
            } catch {
              /* localStorage unavailable */
            }
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 transition-colors hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <OfflineIcon className="h-4 w-4 text-ink-400" />
              <span className="text-sm font-medium text-ink-200">
                {offlineAgents.length} offline agent
                {offlineAgents.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-xs text-ink-500 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-ink-800 p-4 md:grid-cols-2 xl:grid-cols-3">
            {offlineAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function LiveActivitySection() {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h3 className="mc-section-title">Live activity</h3>
        <p className="text-[11px] text-ink-600">
          Streaming via SSE · auto-reconnect
        </p>
      </div>
      <LiveActivityFeed />
    </section>
  );
}

function EmptyAgentsCard() {
  return (
    <div className="mc-card relative overflow-hidden p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 600px 300px at 50% 0%, rgba(99,102,241,0.15), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fox-500/20 to-indigo-500/20 ring-1 ring-fox-500/30">
          <span className="text-3xl">🦊</span>
        </div>
        <h4 className="text-lg font-semibold tracking-tight text-ink-100">
          No agents registered yet
        </h4>
        <p className="mt-2 max-w-md text-sm text-ink-400">
          Mint an API key from{" "}
          <a className="mc-link" href="/keys">
            Keys
          </a>{" "}
          and the bot will appear here automatically on its first heartbeat.
          Every agent is one{" "}
          <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[11px] text-ink-200">
            POST /v1/agents/register
          </code>{" "}
          away.
        </p>
      </div>
    </div>
  );
}
