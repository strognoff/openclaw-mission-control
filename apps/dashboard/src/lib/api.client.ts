/**
 * Client-side API helpers — used by client components for the Keys page
 * (mint/revoke). Safe to import from `"use client"` modules.
 *
 * The admin key is sent over the wire from the browser, which is the same
 * shape the dashboard itself uses for the SSE stream. If/when we add a
 * per-dashboard cookie, this is the place to plug it in.
 */

import type { Event, SseMessage } from "@openclaw-mc/shared";

export interface ApiConfig {
  url: string;
  adminKey: string;
}

function readConfig(): ApiConfig {
  const url = (typeof window !== "undefined"
    ? (window as any).__MC_API_URL__
    : process.env.NEXT_PUBLIC_MC_API_URL) || "http://127.0.0.1:8787/v1/agents";
  const adminKey = (typeof window !== "undefined"
    ? (window as any).__MC_ADMIN_KEY__
    : process.env.NEXT_PUBLIC_MC_ADMIN_KEY) || "";
  return { url: url.replace(/\/+$/, ""), adminKey };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, adminKey } = readConfig();
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

export async function mintKey(agentId: string, label?: string): Promise<{
  id: string;
  agentId: string;
  apiKey: string;
  keyPrefix: string;
  label: string | null;
  createdAt: string;
}> {
  return call(`/v1/agents/admin/keys`, {
    method: "POST",
    body: JSON.stringify({ agentId, label }),
  });
}

export async function revokeKey(id: string): Promise<void> {
  const { url, adminKey } = readConfig();
  const res = await fetch(`${url}/v1/agents/admin/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: { authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`API DELETE key returned ${res.status}`);
  }
}

/** Build the SSE URL the browser EventSource will subscribe to. */
export function liveStreamUrl(): string {
  const { url, adminKey } = readConfig();
  return `${url}/v1/agents/events/stream?token=${encodeURIComponent(adminKey)}`;
}

export type { Event, SseMessage };