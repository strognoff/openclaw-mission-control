/**
 * Summary tiles — six (sometimes seven with errored) headline metrics.
 *
 * Server-rendered. Each tile is a card with a coloured ring + value.
 */

interface SummaryTilesProps {
  online: number;
  working: number;
  idle: number;
  offline: number;
  tasksToday: number;
  failedToday: number;
  toolCallsToday: number;
  errored: number;
}

interface Tile {
  label: string;
  value: number;
  accent: string;
  hint?: string;
}

export function SummaryTiles(props: SummaryTilesProps) {
  const tiles: Tile[] = [
    {
      label: "Online",
      value: props.online,
      accent: "text-emerald-300",
      hint: props.online > 0 ? "heartbeating" : "none active",
    },
    {
      label: "Working",
      value: props.working,
      accent: "text-amber-300",
      hint: "thinking · tool · waiting",
    },
    { label: "Idle", value: props.idle, accent: "text-sky-300" },
    {
      label: "Offline",
      value: props.offline,
      accent: "text-ink-400",
      hint: "no heartbeat > 90s",
    },
    {
      label: "Tasks today",
      value: props.tasksToday,
      accent: "text-indigo-300",
    },
    {
      label: "Failed today",
      value: props.failedToday,
      accent: "text-rose-300",
    },
    {
      label: "Tool calls today",
      value: props.toolCallsToday,
      accent: "text-fuchsia-300",
    },
  ];
  if (props.errored > 0) {
    tiles.push({
      label: "In error",
      value: props.errored,
      accent: "text-rose-400",
      hint: "needs operator attention",
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="mc-card p-4 transition-all hover:border-indigo-500/30"
        >
          <p className="text-xs uppercase tracking-wider text-ink-400">
            {tile.label}
          </p>
          <p className={`mt-2 text-3xl font-semibold tabular-nums ${tile.accent}`}>
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