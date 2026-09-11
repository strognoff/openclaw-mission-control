/**
 * Agent detail page.
 *
 * Server component: fetches the agent + recent events + runs.
 * <LiveStreamProvider> opens one SSE connection, and the
 * <LiveAgentHero> client wrapper consumes it so the status pill,
 * task, activity, tool, and "last heartbeat" fields update without
 * a page reload. Recent runs are static historical data.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAgent, liveStreamUrl } from "@/lib/api.server";
import {
  durationHuman,
  statusColors,
} from "@/lib/format";
import { ClientTime } from "@/components/ClientTime";
import { LiveStreamProvider } from "@/components/LiveStreamProvider";
import { LiveAgentHero } from "@/components/LiveAgentHero";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `${params.id} — Mission Control`,
  };
}

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getAgent(params.id);
  if (!data) notFound();

  const { agent, events, runs } = data;
  const lastRun = runs[0] ?? null;
  const lastRunSummary = lastRun
    ? {
        id: lastRun.id,
        status: lastRun.status,
        durationMs: lastRun.durationMs,
        toolCallCount: lastRun.toolCallCount,
        errorSummary: lastRun.errorSummary,
      }
    : null;

  return (
    <LiveStreamProvider
      initialAgents={[agent]}
      initialEvents={events}
      streamUrl={liveStreamUrl()}
    >
      <div className="space-y-8">
        <div>
          <Link href="/" className="mc-link text-sm">
            ← Back to overview
          </Link>
        </div>

        <LiveAgentHero initialAgent={agent} lastRun={lastRunSummary} />

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-100">
            Activity stream
          </h2>
          <LiveActivityFeed />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-100">
            Recent runs
          </h2>
          {runs.length === 0 ? (
            <div className="mc-card p-8 text-center text-sm text-ink-500">
              No runs yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="mc-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-ink-200">
                        {run.id}
                      </span>
                      <span
                        className={`mc-pill ${statusColors(run.status).bg} ${statusColors(run.status).text} ${statusColors(run.status).ring}`}
                      >
                        {run.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-400">
                      <span>started <ClientTime iso={run.startedAt} /></span>
                      <span>{durationHuman(run.durationMs)}</span>
                      <span>{run.toolCallCount} tool calls</span>
                    </div>
                  </div>
                  {run.task ? (
                    <p className="mt-2 text-sm text-ink-300">{run.task}</p>
                  ) : null}
                  {run.errorSummary ? (
                    <p className="mt-2 text-sm text-rose-300">
                      {run.errorSummary}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </LiveStreamProvider>
  );
}
