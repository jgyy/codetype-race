"use client";
import { Medal, type MedalPlace } from "@/components/icons/Medal";

interface Result {
  id: string;
  display_name: string;
  scaled_wpm: number;
  net_wpm: number;
  gross_wpm: number;
  accuracy: number;
  finished_at: number;
}

interface Delta {
  delta: number;
  rating_after: number;
}

export function Podium({
  results,
  ratings,
}: {
  results: Result[];
  ratings?: Record<string, Delta>;
}) {
  const sorted = [...results].sort((a, b) => {
    if (b.scaled_wpm !== a.scaled_wpm) return b.scaled_wpm - a.scaled_wpm;
    return a.finished_at - b.finished_at;
  });
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-semibold">Podium</h2>
      <ol className="space-y-2">
        {sorted.map((r, i) => {
          const rd = ratings?.[r.display_name];
          const place = (i + 1) as MedalPlace | number;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3"
            >
              <span className="flex items-center gap-3">
                <span className="text-xl">
                  {place <= 3 ? (
                    <Medal place={place as MedalPlace} />
                  ) : (
                    <span aria-label={`${place}th place`}>{place}.</span>
                  )}
                </span>
                <span className="font-mono">{r.display_name}</span>
                {rd && (
                  <span
                    className={
                      rd.delta > 0
                        ? "text-emerald-400"
                        : rd.delta < 0
                        ? "text-red-400"
                        : "text-neutral-400"
                    }
                  >
                    {rd.delta > 0 ? "+" : ""}
                    {rd.delta} → {rd.rating_after}
                  </span>
                )}
              </span>
              <span className="text-sm text-neutral-300">
                {Math.round(r.scaled_wpm)} wpm · {Math.round(r.net_wpm)} net ·{" "}
                {Math.round(r.gross_wpm)} gross · {Math.round(r.accuracy * 100)}% acc
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
