"use client";

interface Result {
  display_name: string;
  scaled_wpm: number;
  net_wpm: number;
  gross_wpm: number;
  accuracy: number;
  finished_at: number;
}

export function Podium({ results }: { results: Result[] }) {
  const sorted = [...results].sort((a, b) => {
    if (b.scaled_wpm !== a.scaled_wpm) return b.scaled_wpm - a.scaled_wpm;
    return a.finished_at - b.finished_at;
  });
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold">Podium</h2>
      <ol className="space-y-2">
        {sorted.map((r, i) => (
          <li
            key={r.display_name}
            className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3"
          >
            <span className="flex items-center gap-3">
              <span className="text-xl">{medals[i] ?? `${i + 1}.`}</span>
              <span className="font-mono">{r.display_name}</span>
            </span>
            <span className="text-sm text-neutral-300">
              {Math.round(r.scaled_wpm)} wpm · {Math.round(r.net_wpm)} net ·{" "}
              {Math.round(r.gross_wpm)} gross · {Math.round(r.accuracy * 100)}% acc
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
