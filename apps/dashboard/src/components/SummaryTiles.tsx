/**
 * Summary tiles — headline metrics with icons + (optional) sparkline.
 *
 * Server-rendered. Each tile has a semantic color, an icon, and a small
 * inline sparkline for metrics that have a time dimension.
 */

import {
  OnlineIcon,
  WorkingIcon,
  IdleIcon,
  OfflineIcon,
  RunIcon,
  ErrorIcon,
  ToolIcon,
  Sparkline,
} from "@/components/icons";

interface SummaryTilesProps {
  online: number;
  working: number;
  idle: number;
  offline: number;
  tasksToday: number;
  failedToday: number;
  toolCallsToday: number;
  errored: number;
  hourlyTasks: number[];
}

interface Tile {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  iconText: string;
  hint?: string;
  accent: string;
  sparkline?: number[];
  sparkColor?: string;
  sparkFill?: string;
}

export function SummaryTiles(props: SummaryTilesProps) {
  const tiles: Tile[] = [
    {
      label: "Online",
      value: props.online,
      icon: <OnlineIcon className="h-5 w-5" />,
      iconBg: "bg-emerald-500/15",
      iconText: "text-emerald-300",
      accent: "text-emerald-300",
      hint: props.online > 0 ? "heartbeating" : "none active",
    },
    {
      label: "Working",
      value: props.working,
      icon: <WorkingIcon className="h-5 w-5" />,
      iconBg: "bg-amber-500/15",
      iconText: "text-amber-300",
      accent: "text-amber-300",
      hint: "thinking · tool · waiting",
    },
    {
      label: "Idle",
      value: props.idle,
      icon: <IdleIcon className="h-5 w-5" />,
      iconBg: "bg-sky-500/15",
      iconText: "text-sky-300",
      accent: "text-sky-300",
    },
    {
      label: "Offline",
      value: props.offline,
      icon: <OfflineIcon className="h-5 w-5" />,
      iconBg: "bg-ink-800/60",
      iconText: "text-ink-400",
      accent: "text-ink-400",
      hint: "no heartbeat > 90s",
    },
    {
      label: "Tasks today",
      value: props.tasksToday,
      icon: <RunIcon className="h-5 w-5" />,
      iconBg: "bg-indigo-500/15",
      iconText: "text-indigo-300",
      accent: "text-indigo-300",
      sparkline: props.hourlyTasks,
      sparkColor: "rgb(129, 140, 248)",
      sparkFill: "rgb(99, 102, 241)",
    },
    {
      label: "Failed today",
      value: props.failedToday,
      icon: <ErrorIcon className="h-5 w-5" />,
      iconBg: "bg-rose-500/15",
      iconText: "text-rose-300",
      accent: "text-rose-300",
    },
    {
      label: "Tool calls today",
      value: props.toolCallsToday,
      icon: <ToolIcon className="h-5 w-5" />,
      iconBg: "bg-fuchsia-500/15",
      iconText: "text-fuchsia-300",
      accent: "text-fuchsia-300",
    },
  ];
  if (props.errored > 0) {
    tiles.push({
      label: "In error",
      value: props.errored,
      icon: <ErrorIcon className="h-5 w-5" />,
      iconBg: "bg-rose-500/15",
      iconText: "text-rose-300",
      accent: "text-rose-300",
      hint: "needs operator attention",
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="mc-card mc-card-hover relative overflow-hidden p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${tile.iconBg} ${tile.iconText} ring-1 ring-inset ring-white/5`}
              >
                {tile.icon}
              </span>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
                {tile.label}
              </p>
            </div>
            {tile.sparkline ? (
              <Sparkline
                values={tile.sparkline}
                stroke={tile.sparkColor ?? "currentColor"}
                fill={tile.sparkFill ?? "transparent"}
              />
            ) : null}
          </div>
          <p
            className={`mt-3 text-3xl font-semibold tabular-nums tracking-tight ${tile.accent}`}
          >
            {tile.value}
          </p>
          {tile.hint ? (
            <p className="mt-1 text-xs text-ink-500">{tile.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
