/**
 * Mission Control — main overview page.
 *
 * - Server component: fetches the agent list + recent events on each request.
 * - Polled every 5s by the client (we use Next's `revalidate` hint for the
 *   server fetch).
 * - The live SSE feed runs client-side and patches the view as events arrive.
 */

import { listAgents, listRecentEvents } from "@/lib/api.server";
import {
  bucketEventsToday,
  isOnlineStatus,
  relativeTime,
} from "@/lib/format";
import { AgentCard } from "@/components/AgentCard";
import { SummaryTiles } from "@/components/SummaryTiles";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { OnlineIcon, OfflineIcon, ServerIcon } from "@/components/icons";
import { liveStreamUrl } from "@/lib/api.server";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [agents, recent] = await Promise.all([
    listAgents().catch(() => []),
    listRecentEvents(120).catch(() => ({ events: [] })),
  ]);

  const online = agents.filter((a) => isOnlineStatus(a.currentStatus)).length;
  const offline = agents.filter((a) => a.currentStatus === "OFFLINE").length;
  const working = agents.filter((a) =>
    ["WORKING", "THINKING", "TOOL", "WAITING"].includes(a.currentStatus),
  ).length;
  const idle = agents.filter((a) => a.currentStatus === "IDLE").length;
  const errored = agents.filter((a) => a.currentStatus === "ERROR").length;

  const todays = recent.events.filter(
    (e) => bucketEventsToday.isToday(e.timestamp),
  );
  const tasksToday = todays.filter(
    (e) => e.type === "run_started" || e.type === "run_completed",
  ).length;
  const failedToday = todays.filter(
    (e) => e.type === "run_failed" || e.type === "tool_failed",
  ).length;
  const toolCallsToday = todays.filter(
    (e) => e.type === "tool_started" || e.type === "tool_completed",
  ).length;

  // Hourly buckets for "tasks today" sparkline (last 12 hours).
  const hourlyBuckets = bucketEventsToday.hourly(todays, 12);

  return (
    <div className="space-y-10">
      {/* Hero / status strip */}
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
              <span className="hidden sm:inline">last refresh </span>
              <span className="font-mono text-ink-300">
                {relativeTime(new Date().toISOString())}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Summary tiles */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="mc-section-title">Overview</h3>
          <p className="text-[11px] text-ink-600">
            Updated {relativeTime(new Date().toISOString())}
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

      {/* Agents */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="mc-section-title">Agents</h3>
          <p className="text-[11px] text-ink-600">
            {agents.length} total · {online} online
          </p>
        </div>
        {agents.length === 0 ? (
          <EmptyAgentsCard />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>

      {/* Live activity */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="mc-section-title">Live activity</h3>
          <p className="text-[11px] text-ink-600">
            Streaming via SSE · auto-reconnect
          </p>
        </div>
        <LiveActivityFeed
          initialEvents={recent.events}
          agents={agents}
          streamUrl={liveStreamUrl()}
        />
      </section>
    </div>
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
