"use client";

/**
 * OfficeView — pixel-art virtual office with framer-motion animations.
 *
 * Renders the live agent roster as pixel sprite characters at desks inside
 * a stylised office scene. Each agent's status drives the sprite's animation
 * and visual treatment; new message_sent events spawn brief flying-task
 * indicators above the sender's desk.
 *
 * Data sources:
 *   - useAgents() (LiveStreamProvider) for live currentStatus
 *   - useEvents() to detect message_sent for flying-task spawns
 *
 * Inspired by https://github.com/wickedapp/openclaw-office (MIT). Sprites
 * vendored from upstream public/sprites/agent-*-v2.png; framer-motion 11
 * (the upstream uses 12, which is React 19 only — we pin to ^11.18.0 for
 * React 18 compat).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Agent, AgentStatus } from "@openclaw-mc/shared";
import { statusColors } from "@/lib/format";
import { useAgents, useEvents } from "@/components/LiveStreamProvider";

interface Props {
  /** Click an agent to jump to their detail page. */
  hrefBase?: string;
}

type PositionedAgent = Agent & { _x: number; _y: number };

/**
 * Deterministic desk positions as % of the office viewport. Inspired by
 * the layout table in wickedapp/openclaw-office IsometricOffice.js but
 * linearised here for the flat (non-isometric) scene.
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

const SPRITE_VARIANTS = [
  "agent-py-v2.webp",
  "agent-quill-v2.webp",
  "agent-savy-v2.webp",
  "agent-vigil-v2.webp",
  "agent-wickedman-v2.webp",
] as const;

function spriteFor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return SPRITE_VARIANTS[hash % SPRITE_VARIANTS.length];
}

const STATUS_OVERLAY: Record<AgentStatus, string> = {
  IDLE: "",
  WORKING: "brightness-110",
  THINKING: "hue-rotate-15",
  TOOL: "brightness-125 saturate-150",
  WAITING: "brightness-90",
  COMPLETE: "hue-rotate-90 saturate-150",
  ERROR: "hue-rotate-180 saturate-200",
  OFFLINE: "grayscale opacity-60",
};

// Per-status framer-motion animation configs. Each one runs on a loop
// appropriate to the status (idle bob, working vibration, etc.).
//
// The `repeatType` literal union is required by framer-motion's Transition
// type — using a generic `string` widens "mirror" to string and breaks
// the assignability to motion.div's animate prop.
const STATUS_ANIMATION: Record<
  AgentStatus,
  {
    y?: number[];
    x?: number[];
    rotate?: number[];
    scale?: number[];
    opacity?: number;
    transition: {
      duration: number;
      repeat: number;
      ease?: "linear" | "easeIn" | "easeOut" | "easeInOut";
      repeatType?: "reverse" | "mirror" | "loop";
    };
  }
> = {
  IDLE: {
    y: [0, -2, 0],
    transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
  },
  WORKING: {
    y: [0, -1, 0, -1, 0],
    transition: { duration: 0.4, repeat: Infinity },
  },
  THINKING: {
    rotate: [0, -4, 4, 0],
    transition: { duration: 2.2, repeat: Infinity },
  },
  TOOL: {
    scale: [1, 1.06, 1],
    transition: { duration: 1.4, repeat: Infinity },
  },
  WAITING: {
    rotate: [0, 360],
    transition: { duration: 4, repeat: Infinity, ease: "linear" },
  },
  COMPLETE: {
    scale: [1, 1.2, 1],
    transition: { duration: 0.6, repeat: 1 },
  },
  ERROR: {
    x: [-2, 2, -2],
    transition: { duration: 0.2, repeat: Infinity, repeatType: "mirror" },
  },
  OFFLINE: {
    opacity: 0.5,
    transition: { duration: 1, repeat: 0 },
  },
};

const STATUS_EMOJI: Record<AgentStatus, string> = {
  IDLE: "💤",
  WORKING: "⚡",
  THINKING: "💭",
  TOOL: "🔧",
  WAITING: "⏳",
  COMPLETE: "✅",
  ERROR: "❗",
  OFFLINE: "💀",
};

function Desk({ agent, hrefBase }: { agent: PositionedAgent; hrefBase: string }) {
  const offline = agent.currentStatus === "OFFLINE";
  const sprite = spriteFor(agent.id);
  const overlay = STATUS_OVERLAY[agent.currentStatus];
  const anim = STATUS_ANIMATION[agent.currentStatus];
  const emoji = STATUS_EMOJI[agent.currentStatus];
  const pill = statusColors(agent.currentStatus);
  return (
    <Link
      href={`${hrefBase}/${agent.id}`}
      className="group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
      style={{ left: `${agent._x}%`, top: `${agent._y}%` }}
      aria-label={`${agent.name} — ${agent.currentStatus.toLowerCase()}`}
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
        {/* Pixel sprite above the desk (with framer-motion status animation) */}
        <motion.div
          className="absolute left-1/2 -top-12 -translate-x-1/2"
          animate={anim}
          whileHover={{ scale: 1.15 }}
        >
          <div className="relative h-12 w-12">
            <Image
              src={`/sprites/office/${sprite}`}
              alt={agent.name}
              width={48}
              height={48}
              className={`pixel-art h-full w-full ${overlay}`}
              unoptimized
              priority={false}
            />
            {/* Status emoji floating above the sprite */}
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm drop-shadow-md">
              {emoji}
            </span>
          </div>
        </motion.div>
        {/* Name tag below desk */}
        <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950/85 px-1.5 py-0.5 font-mono text-[10px] text-ink-200 ring-1 ring-white/10 shadow-sm">
          {agent.name.length > 14 ? `${agent.name.slice(0, 13)}…` : agent.name}
        </div>
        {/* Status pill on hover */}
        <div
          className={`pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider opacity-0 ring-1 ring-white/10 transition-opacity duration-200 group-hover:opacity-100 ${pill.bg} ${pill.text}`}
        >
          {agent.currentStatus.toLowerCase()}
        </div>
      </div>
    </Link>
  );
}

interface FlyingTask {
  id: string;
  x: number;
  y: number;
}

function FlyingTasks({
  tasks,
  onExpire,
}: {
  tasks: FlyingTask[];
  onExpire: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {tasks.map((task) => (
        <motion.div
          key={task.id}
          className="pointer-events-none absolute z-40"
          style={{ left: `${task.x}%`, top: `${task.y}%` }}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: -50, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, times: [0, 0.2, 0.8, 1] }}
          onAnimationComplete={() => onExpire(task.id)}
        >
          <div className="rounded-md bg-cyan-400/95 px-2 py-0.5 text-[10px] font-bold text-ink-950 shadow-lg ring-1 ring-cyan-200">
            ✉️ sent
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
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
  const events = useEvents();
  const [activeTasks, setActiveTasks] = useState<FlyingTask[]>([]);

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

  // Spawn a brief flying-task indicator whenever a fresh message_sent
  // event arrives for one of our agents.
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (!latest || latest.type !== "message_sent") return;
    const agent = positioned.find((a) => a.id === latest.agentId);
    if (!agent) return;
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActiveTasks((prev) => [
      ...prev.slice(-3),
      { id, x: agent._x, y: agent._y },
    ]);
  }, [events, positioned]);

  const handleExpire = (id: string) => {
    setActiveTasks((prev) => prev.filter((t) => t.id !== id));
  };

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
        {/* Floor + back wall + city-lights window strip */}
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
            const cx = 160 + ((i * 37) % 1280);
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
            {positioned.length} agent{positioned.length === 1 ? "" : "s"} on shift
          </text>
        </svg>

        {/* Pixel-art agents at desks */}
        {positioned.map((agent) => (
          <Desk key={agent.id} agent={agent} hrefBase={hrefBase} />
        ))}

        {/* Flying tasks (transient) */}
        <FlyingTasks tasks={activeTasks} onExpire={handleExpire} />
      </div>

      {/* Footer: legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800/80 px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
          <span>Legend:</span>
          {(
            [
              ["IDLE", "💤"],
              ["WORKING", "⚡"],
              ["THINKING", "💭"],
              ["TOOL", "🔧"],
              ["WAITING", "⏳"],
              ["COMPLETE", "✅"],
              ["ERROR", "❗"],
              ["OFFLINE", "💀"],
            ] as Array<[AgentStatus, string]>
          ).map(([status, emoji]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span aria-hidden>{emoji}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                {status.toLowerCase()}
              </span>
            </span>
          ))}
        </div>
        <p className="text-[11px] text-ink-600">
          Sprites from{" "}
          <a
            href="https://github.com/wickedapp/openclaw-office"
            className="text-ink-400 underline decoration-dotted underline-offset-2 hover:text-ink-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            openclaw-office
          </a>
          . Animations: framer-motion 11.
        </p>
      </div>
    </div>
  );
}
