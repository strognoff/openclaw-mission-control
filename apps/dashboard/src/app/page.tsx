/**
 * Mission Control — main overview page.
 *
 * Server component: fetches initial data, then hands off to
 * <LiveStreamProvider> which owns the SSE connection and feeds
 * the client-side sections (HeroStrip, SummarySection, etc.)
 * so the cards and tiles update without a page reload.
 */

import { listAgents, listRecentEvents } from "@/lib/api.server";
import { liveStreamUrl } from "@/lib/api.server";
import { LiveStreamProvider } from "@/components/LiveStreamProvider";
import {
  HeroStrip,
  SummarySection,
  AgentsSection,
  LiveActivitySection,
} from "@/components/OverviewClient";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [agents, recent] = await Promise.all([
    listAgents().catch(() => []),
    listRecentEvents(120).catch(() => ({ events: [] })),
  ]);

  return (
    <LiveStreamProvider
      initialAgents={agents}
      initialEvents={recent.events}
      streamUrl={liveStreamUrl()}
    >
      <div className="space-y-10">
        <HeroStrip />
        <SummarySection />
        <AgentsSection />
        <LiveActivitySection />
      </div>
    </LiveStreamProvider>
  );
}
