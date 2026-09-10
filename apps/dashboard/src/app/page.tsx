/**
 * Mission Control — main overview page.
 *
 * - Server component: fetches the agent list + recent events on each request.
 * - Polled every 5s by the client (we use Next's `revalidate` hint for the
 *   server fetch).
 * - The live SSE feed runs client-side and patches the view as events arrive.
 */

import { listAgents, listRecentEvents, liveStreamUrl } from "@/lib/api.server";
import { isOnlineStatus, relativeTime, statusColors } from "@/lib/format";
import { AgentCard } from "@/components/AgentCard";
import { SummaryTiles } from "@/components/SummaryTiles";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [agents, recent] = await Promise.all([
    listAgents().catch(() => []),
    listRecentEvents(30).catch(() => ({ events: [] })),
  ]);

  const online = agents.filter((a) => isOnlineStatus(a.currentStatus)).length;
  const offline = agents.filter((a) => a.currentStatus === "OFFLINE").length;
  const working = agents.filter((a) =>
    ["WORKING", "THINKING", "TOOL", "WAITING"].includes(a.currentStatus),
  ).length;
  const idle = agents.filter((a) => a.currentStatus === "IDLE").length;
  const errored = agents.filter((a) => a.currentStatus === "ERROR").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todays = recent.events.filter((e) => new Date(e.timestamp) >= today);
  const tasksToday = todays.filter(
    (e) => e.type === "run_started" || e.type === "run_completed",
  ).length;
  const failedToday = todays.filter((e) => e.type === "run_failed" || e.type === "tool_failed").length;
  const toolCallsToday = todays.filter(
    (e) => e.type === "tool_started" || e.type === "tool_completed",
  ).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">
            Overview
          </h2>
          <p className="text-xs text-ink-500">
            {agents.length} agent{agents.length === 1 ? "" : "s"} ·
            last refresh {relativeTime(new Date().toISOString())}
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
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-100">
          Agents
        </h2>
        {agents.length === 0 ? (
          <div className="mc-card p-10 text-center">
            <p className="text-ink-400">
              No agents registered yet. Mint a key from{" "}
              <a className="mc-link" href="/keys">
                Keys
              </a>{" "}
              and the bot will appear once it registers itself.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-100">
          Live activity
        </h2>
        <LiveActivityFeed
          initialEvents={recent.events}
          agents={agents}
          streamUrl={liveStreamUrl()}
        />
      </section>

      {/* Tiny decorative fox divider so the page never feels empty. */}
      <p className="text-center text-xs text-ink-600">🦊 · 🦊 · 🦊</p>
    </div>
  );
}