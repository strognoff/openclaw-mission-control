/**
 * Server-side API client.
 *
 * The dashboard fetches data on the server (Next 14 App Router server
 * components). Auth is admin-level, header-only, no cookies.
 *
 * For the live SSE feed we use a separate client (in `liveStream.ts` —
 * the URL builder lives here for sharing). EventSource doesn't run on
 * the server.
 */

import "server-only";
import type { Agent, Event, Run } from "@openclaw-mc/shared";

export interface ApiConfig {
  url: string;
  adminKey: string;
}

export function getApiConfig(): ApiConfig {
  const url = process.env.MC_API_URL || "http://127.0.0.1:8787/v1/agents";
  const adminKey = process.env.MC_ADMIN_KEY || "";
  if (!adminKey) {
    throw new Error("MC_ADMIN_KEY is not set");
  }
  return { url: url.replace(/\/+$/, ""), adminKey };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, adminKey } = getApiConfig();
  const res = await fetch(`${url}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      authorization: `Bearer ${adminKey}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function listAgents(): Promise<Agent[]> {
  const r = await call<{ agents: Agent[] }>("/v1/agents");
  return r.agents;
}

export async function getAgent(id: string): Promise<{
  agent: Agent;
  events: Event[];
  runs: Run[];
} | null> {
  try {
    return await call(`/v1/agents/${encodeURIComponent(id)}`);
  } catch (err) {
    if ((err as Error).message.includes("404")) return null;
    throw err;
  }
}

export async function listRecentEvents(limit = 30): Promise<{ events: Event[] }> {
  return call(`/v1/agents/events/recent?limit=${limit}`);
}

export async function listKeys(): Promise<{
  keys: Array<{
    id: string;
    agentId: string;
    keyPrefix: string;
    label: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
}> {
  return call(`/v1/agents/admin/keys`);
}

/**
 * Build the SSE URL the browser EventSource will subscribe to.
 *
 * IMPORTANT: the dashboard page is served over HTTPS at menuboard.online.
 * Browser EventSource connections from an HTTPS page to an HTTP URL are
 * blocked by the mixed-content security policy, so the SSE URL MUST be
 * the public HTTPS one. NEXT_PUBLIC_MC_API_URL is inlined at build time
 * by Next.js and is the browser-safe value; MC_API_URL is server-only
 * (localhost) and only useful for SSR fetches via `getApiConfig()`.
 */
export function liveStreamUrl(): string {
  const url = (
    process.env.NEXT_PUBLIC_MC_API_URL ||
    process.env.MC_API_URL ||
    "http://127.0.0.1:8787/v1/agents"
  ).replace(/\/+$/, "");
  const adminKey =
    process.env.NEXT_PUBLIC_MC_ADMIN_KEY ||
    process.env.MC_ADMIN_KEY ||
    "";
  if (!adminKey) {
    throw new Error("MC_ADMIN_KEY is not set");
  }
  return `${url}/v1/agents/events/stream?token=${encodeURIComponent(adminKey)}`;
}