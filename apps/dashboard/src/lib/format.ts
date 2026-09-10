/**
 * Formatting helpers — relative time, status colors, tool duration.
 *
 * Pure functions, no React, no DOM. Safe to import anywhere.
 */

import type { AgentStatus, EventType } from "@openclaw-mc/shared";

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  if (diff < 2_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function durationHuman(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

const STATUS_COLORS: Record<AgentStatus, { dot: string; bg: string; text: string; ring: string }> = {
  IDLE: {
    dot: "bg-ink-400",
    bg: "bg-ink-800/40",
    text: "text-ink-200",
    ring: "ring-ink-700/40",
  },
  WORKING: {
    dot: "bg-amber-400",
    bg: "bg-amber-500/10",
    text: "text-amber-200",
    ring: "ring-amber-500/30",
  },
  THINKING: {
    dot: "bg-sky-400",
    bg: "bg-sky-500/10",
    text: "text-sky-200",
    ring: "ring-sky-500/30",
  },
  TOOL: {
    dot: "bg-indigo-400",
    bg: "bg-indigo-500/10",
    text: "text-indigo-200",
    ring: "ring-indigo-500/30",
  },
  WAITING: {
    dot: "bg-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-200",
    ring: "ring-fuchsia-500/30",
  },
  COMPLETE: {
    dot: "bg-emerald-400",
    bg: "bg-emerald-500/10",
    text: "text-emerald-200",
    ring: "ring-emerald-500/30",
  },
  ERROR: {
    dot: "bg-rose-400",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    ring: "ring-rose-500/30",
  },
  OFFLINE: {
    dot: "bg-ink-600",
    bg: "bg-ink-900/60",
    text: "text-ink-400",
    ring: "ring-ink-700/30",
  },
};

export function statusColors(status: AgentStatus | string) {
  return (
    STATUS_COLORS[status as AgentStatus] ?? {
      dot: "bg-ink-400",
      bg: "bg-ink-800/40",
      text: "text-ink-200",
      ring: "ring-ink-700/40",
    }
  );
}

const EVENT_DOT: Record<EventType, string> = {
  agent_online: "bg-emerald-400",
  agent_offline: "bg-ink-500",
  run_started: "bg-amber-400",
  run_completed: "bg-emerald-400",
  run_failed: "bg-rose-400",
  thinking: "bg-sky-400",
  tool_started: "bg-indigo-400",
  tool_completed: "bg-emerald-400",
  tool_failed: "bg-rose-400",
  waiting: "bg-fuchsia-400",
  heartbeat: "bg-ink-400",
  status_changed: "bg-amber-300",
};

export function eventDot(type: EventType | string): string {
  return EVENT_DOT[type as EventType] ?? "bg-ink-400";
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isOnlineStatus(status: AgentStatus | string): boolean {
  return status !== "OFFLINE";
}

export function summarizeEvent(activity: string | null, tool: string | null): string {
  if (activity && activity.length > 0) return activity;
  if (tool) return `Tool: ${tool}`;
  return "—";
}