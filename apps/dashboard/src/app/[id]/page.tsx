/**
 * Agent detail page.
 *
 * - Server component: full metadata + last 50 events + last 5 runs.
 * - SSE feed for the activity stream lives in a client wrapper so the live
 *   append doesn't require a full page reload.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAgent, liveStreamUrl } from "@/lib/api.server";
import {
  durationHuman,
  isOnlineStatus,
  relativeTime,
  statusColors,
} from "@/lib/format";
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
  const colors = statusColors(agent.currentStatus);
  const online = isOnlineStatus(agent.currentStatus);
  const lastRun = runs[0] ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="mc-link text-sm">
          ← Back to overview
        </Link>
      </div>

      <header className="mc-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🦊</span>
              <div>
                <h1 className="text-2xl font-semibold text-ink-50">
                  {agent.name}
                </h1>
                <p className="font-mono text-xs text-ink-500">{agent.id}</p>
              </div>
            </div>
          </div>
          <span
            className={`mc-pill self-start text-sm ${colors.bg} ${colors.text} ${colors.ring}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${colors.dot} ${online ? "fox-blink" : ""}`}
              aria-hidden
            />
            {agent.currentStatus}
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Task" value={agent.currentTask ?? "—"} />
          <Field label="Activity" value={agent.currentActivity ?? "—"} />
          <Field label="Tool" value={agent.currentTool ?? "—"} />
          <Field
            label="Provider / model"
            value={
              agent.provider || agent.model
                ? `${agent.provider ?? "?"}/${agent.model ?? "?"}`
                : "—"
            }
          />
          <Field label="Host" value={agent.hostname} />
          <Field label="Platform" value={agent.platform} />
          <Field label="OpenClaw" value={agent.openclawVersion} />
          <Field
            label="Last heartbeat"
            value={relativeTime(agent.lastHeartbeat)}
          />
          {lastRun ? (
            <>
              <Field label="Last run id" value={lastRun.id} mono />
              <Field
                label="Last run status"
                value={`${lastRun.status} · ${durationHuman(lastRun.durationMs)}`}
              />
              <Field label="Last run tool calls" value={String(lastRun.toolCallCount)} />
              {lastRun.errorSummary ? (
                <Field label="Last error" value={lastRun.errorSummary} />
              ) : (
                <Field label="Last seen" value={relativeTime(agent.lastSeen)} />
              )}
            </>
          ) : (
            <Field label="Last seen" value={relativeTime(agent.lastSeen)} />
          )}
        </dl>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink-100">
          Activity stream
        </h2>
        <LiveActivityFeed
          initialEvents={events}
          agents={[agent]}
          streamUrl={liveStreamUrl()}
        />
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
                    <span>started {relativeTime(run.startedAt)}</span>
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
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm text-ink-100 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}