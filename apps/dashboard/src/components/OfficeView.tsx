"use client";

/**
 * OfficeView — first cut of the virtual AI office visualisation.
 *
 * Renders the live agent roster as sprites sitting at desks inside a
 * stylised office scene. Each agent's current status (online/working,
   idle, offline) drives its sprite colour and a small task indicator
   ("…" thinking, tool dot, status pill).
 *
 * Data sources:
 *   - useAgents() (LiveStreamProvider) for live currentStatus
 *
 * Scope of THIS cut:
 *   - Self-contained SVG / Tailwind scene — no external image assets.
 *   - Agents placed at deterministic desk positions (no drag/drop yet).
 *   - CSS transitions on colour when status changes.
 *   - Falls back to "Add a workspace" CTA when no agents are registered.
 *
 * NOT in this cut (would require additional infrastructure):
 *   - Flying task / request-pipeline animations (from
 *     wickedapp/openclaw-office's IsometricOffice.js) — those depend on
 *     the openclaw-office-notify-plugin to push workflow events, and on
 *     framer-motion. We don't have the plugin wired up here; once a
 *     workflow-event stream lands, swap this component for one that
 *     animates flight paths between desks.
 *   - AI-generated office scenes (Gemini), desk auto-detection (Claude
 *     Vision), cost dashboard, security dashboard — out of scope for the
 *     overview tab.
 *
 * Inspired by https://github.com/wickedapp/openclaw-office (MIT).
 */

import { useMemo } from "react";
import Link from "next/link";
import type { Agent, AgentStatus } from "@openclaw-mc/shared";
import { statusColors } from "@/lib/format";
import { useAgents } from "@/components/LiveStreamProvider";

interface Props {
  /** Click an agent to jump to their detail page. */
  hrefBase?: string;
}

type PositionedAgent = Agent & { _x: number; _y: number };

/**
 * Deterministic desk positions as % of the office viewport. Inspired by
 * the layout table in wickedapp/openclaw-office IsometricOffice.js but
 * linearised here for the flat (non-isometric) scene.
 *
 * Order matches the order agents appear in `useAgents()` — agents are
 * re-positioned deterministically when the roster changes.
 */
const DESK_POSITIONS: ReadonlyArray<{ x: number; y: number; row: number }> = [
  { x: 16, y: 38, row: 0 },
  { x: 32, y: 38, row: 0 },
  { x: 48, y: 38, row: 0 },
  { x: 64, y: 38, row: 0 },
  { x: 80, y: 38, row: 0 },
  { x: 24, y: 70, row: 1 },
  { x: 40, y: 70, row: 1 },
  { x: 56, y: 70, row: 1 },
  { x: 72, y: 70, row: 1 },
];

const STATUS_SPRITE: Record<
  AgentStatus,
  { ringClass: string; bodyClass: string; label: string }
> = {
  IDLE: {
    ringClass: "bg-emerald-400/70",
    bodyClass: "bg-emerald-300",
    label: "idle",
  },
  WORKING: {
    ringClass: "bg-amber-400/70",
    bodyClass: "bg-amber-300",
    label: "working",
  },
  THINKING: {
    ringClass: "bg-sky-400/70",
    bodyClass: "bg-sky-300",
    label: "thinking",
  },
  TOOL: {
    ringClass: "bg-indigo-400/70",
    bodyClass: "bg-indigo-300",
    label: "tool",
  },
  WAITING: {
    ringClass: "bg-fuchsia-400/70",
    bodyClass: "bg-fuchsia-300",
    label: "waiting",
  },
  COMPLETE: {
    ringClass: "bg-emerald-400/70",
    bodyClass: "bg-emerald-300",
    label: "complete",
  },
  ERROR: {
    ringClass: "bg-rose-400/70",
    bodyClass: "bg-rose-300",
    label: "error",
  },
  OFFLINE: {
    ringClass: "bg-ink-700/70",
    bodyClass: "bg-ink-600",
    label: "offline",
  },
};

function avatarLetter(name: string): string {
  const m = name.trim().match(/[a-zA-Z0-9]/);
  return ((m?.[0] ?? "?") as string).toUpperCase();
}

function Desk({ agent, hrefBase }: { agent: PositionedAgent; hrefBase: string }) {
  const sprite = STATUS_SPRITE[agent.currentStatus] ?? STATUS_SPRITE.OFFLINE;
  const offline = agent.currentStatus === "OFFLINE";
  return (
    <Link
      href={`${hrefBase}/${agent.id}`}
      className="group absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
      style={{ left: `${agent._x}%`, top: `${agent._y}%` }}
      aria-label={`${agent.name} — ${sprite.label}`}
    >
      {/* Desk surface */}
      <div
        className={`relative h-12 w-16 rounded-md border border-white/10 ${
          offline ? "bg-ink-900/60" : "bg-ink-800/70"
        } shadow-md backdrop-blur-sm`}
      >
        {/* Monitor on the desk */}
        <div
          className={`absolute left-1/2 top-1.5 h-5 w-9 -translate-x-1/2 rounded-sm ${
            offline ? "bg-ink-950/80" : "bg-ink-950"
          } ring-1 ring-white/10`}
        >
          <span
            className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500 ${
              offline ? "bg-ink-700" : "bg-fuchsia-400/80 animate-pulse"
            }`}
          />
        </div>
        {/* Sprite head poking above the desk */}
        <div className="absolute left-1/2 -top-7 -translate-x-1/2">
          <div className="relative">
            <div
              className={`absolute inset-0 -m-1 rounded-full ${sprite.ringClass} blur-sm transition-colors duration-500`}
              aria-hidden
            />
            <div
              className={`relative flex h-9 w-9 items-center justify-center rounded-full ${sprite.bodyClass} text-xs font-bold text-ink-950 ring-2 ring-ink-950/40 shadow-md transition-colors duration-500`}
            >
              {avatarLetter(agent.name)}
            </div>
          </div>
        </div>
        {/* Name tag below desk */}
        <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950/85 px-1.5 py-0.5 font-mono text-[10px] text-ink-200 ring-1 ring-white/10 shadow-sm">
          {agent.name.length > 14 ? `${agent.name.slice(0, 13)}…` : agent.name}
        </div>
        {/* Status pill on hover */}
        <div
          className={`pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider opacity-0 ring-1 ring-white/10 transition-opacity duration-200 group-hover:opacity-100 ${
            statusColors(agent.currentStatus).bg
          } ${statusColors(agent.currentStatus).text}`}
        >
          {sprite.label}
        </div>
      </div>
    </Link>
  );
}

function EmptyOffice() {
  return (
    <div className="flex aspect-[16/9] w-full flex-col items-center justify-center rounded-xl border border-ink-800/80 bg-gradient-to-br from-ink-900/60 via-ink-950/40 to-ink-900/60 p-8 text-center">
      <div className="text-4xl">🏢</div>
      <h4 className="mt-3 text-sm font-semibold text-ink-100">
        The office is empty
      </h4>
      <p className="mt-1 max-w-sm text-xs text-ink-500">
        Once agents heartbeat, they&apos;ll appear at their desks here. Mint
        a key on the Keys page and your bot will check in.
      </p>
    </div>
  );
}

export function OfficeView({ hrefBase = "/agents" }: Props = {}) {
  const allAgents = useAgents();

  // Sort: online before offline (stable inside each group), then name.
  // Assign desk positions based on that.
  const positioned = useMemo(() => {
    const sorted = [...allAgents].sort((a, b) => {
      const aOffline = a.currentStatus === "OFFLINE" ? 1 : 0;
      const bOffline = b.currentStatus === "OFFLINE" ? 1 : 0;
      if (aOffline !== bOffline) return aOffline - bOffline;
      return a.name.localeCompare(b.name);
    });
    return sorted.map((a, i) => ({
      ...a,
      _x: DESK_POSITIONS[i % DESK_POSITIONS.length].x,
      _y: DESK_POSITIONS[i % DESK_POSITIONS.length].y,
    }));
  }, [allAgents]);

  if (allAgents.length === 0) {
    return (
      <div className="mc-card overflow-hidden">
        <EmptyOffice />
      </div>
    );
  }

  return (
    <div className="mc-card overflow-hidden">
      {/* Scene */}
      <div
        className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-ink-900/70 via-ink-950/60 to-indigo-950/40"
        role="img"
        aria-label={`Virtual office with ${positioned.length} agents at their desks`}
      >
        {/* Floor + grid lines */}
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.85" />
            </linearGradient>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(99,102,241,0.08)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="1600" height="900" fill="url(#grid)" />
          <rect y="280" width="1600" height="620" fill="url(#floor)" />
          {/* Back wall + window strip */}
          <rect x="0" y="0" width="1600" height="280" fill="#0b1029" />
          <rect
            x="120"
            y="60"
            width="1360"
            height="180"
            fill="none"
            stroke="rgba(129,140,248,0.18)"
            strokeWidth="2"
            rx="6"
          />
          {/* Horizontal window bars */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`vbar-${i}`}
              x1={120 + ((1360 / 9) * (i + 1))}
              y1="60"
              x2={120 + ((1360 / 9) * (i + 1))}
              y2="240"
              stroke="rgba(129,140,248,0.12)"
              strokeWidth="1"
            />
          ))}
          {/* City lights in the strip */}
          {Array.from({ length: 36 }).map((_, i) => {
            const cx = 160 + (i * 37) % 1280;
            const cy = 100 + ((i * 17) % 110);
            const r = 1 + ((i * 13) % 3);
            const opacity = 0.2 + ((i * 7) % 6) / 10;
            return (
              <circle
                key={`city-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                fill="#fbbf24"
                opacity={opacity}
              />
            );
          })}
          {/* Floor seam */}
          <line
            x1="0"
            y1="280"
            x2="1600"
            y2="280"
            stroke="rgba(99,102,241,0.25)"
            strokeWidth="1.5"
          />
          {/* Desk rows (subtle) */}
          <line
            x1="80"
            y1="324"
            x2="1520"
            y2="324"
            stroke="rgba(99,102,241,0.12)"
            strokeWidth="1"
          />
          <line
            x1="80"
            y1="630"
            x2="1520"
            y2="630"
            stroke="rgba(99,102,241,0.12)"
            strokeWidth="1"
          />
          {/* Title strip */}
          <text
            x="40"
            y="50"
            fill="rgba(165,180,252,0.6)"
            fontFamily="monospace"
            fontSize="18"
          >
            OPENCLAW · OFFICE
          </text>
          <text
            x="1560"
            y="50"
            textAnchor="end"
            fill="rgba(165,180,252,0.4)"
            fontFamily="monospace"
            fontSize="12"
          >
            {positioned.length} desk{positioned.length === 1 ? "" : "s"} occupied
          </text>
        </svg>

        {/* Agents overlaid via absolutely positioned Links */}
        {positioned.map((agent) => (
          <Desk key={agent.id} agent={agent} hrefBase={hrefBase} />
        ))}
      </div>

      {/* Footer: legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800/80 px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
          <span>Legend:</span>
          {(
            [
              ["IDLE", "idle"],
              ["WORKING", "working"],
              ["THINKING", "thinking"],
              ["TOOL", "tool"],
              ["WAITING", "waiting"],
              ["COMPLETE", "complete"],
              ["ERROR", "error"],
              ["OFFLINE", "offline"],
            ] as Array<[AgentStatus, string]>
          ).map(([status, label]) => {
            const sprite = STATUS_SPRITE[status];
            return (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${sprite.bodyClass}`}
                  aria-hidden
                />
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                  {label}
                </span>
              </span>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-600">
          Inspired by{" "}
          <a
            href="https://github.com/wickedapp/openclaw-office"
            className="text-ink-400 underline decoration-dotted underline-offset-2 hover:text-ink-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            openclaw-office
          </a>
          . Full live animations need the upstream notify plugin.
        </p>
      </div>
    </div>
  );
}