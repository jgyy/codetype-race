"use client";

interface Player {
  display_name: string;
  progress: number;
  finished_at?: number;
  scaled_wpm?: number;
}

export function Leaderboard({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => {
    if (a.finished_at && b.finished_at) {
      return (b.scaled_wpm ?? 0) - (a.scaled_wpm ?? 0);
    }
    if (a.finished_at) return -1;
    if (b.finished_at) return 1;
    return b.progress - a.progress;
  });

  return (
    <ul className="space-y-2">
      {sorted.map((p) => (
        <li key={p.display_name} className="flex items-center gap-3">
          <span className="w-32 truncate text-sm">{p.display_name}</span>
          <div className="flex-1 h-3 rounded bg-neutral-800 overflow-hidden">
            <div
              className={`h-full ${
                p.finished_at ? "bg-yellow-400" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.round(p.progress * 100)}%` }}
            />
          </div>
          <span className="w-16 text-right text-xs text-neutral-400">
            {p.finished_at
              ? `${Math.round(p.scaled_wpm ?? 0)} wpm`
              : `${Math.round(p.progress * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}
