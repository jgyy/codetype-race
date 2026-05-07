"use client";
import { useEffect, useRef, useState } from "react";

type Sample = [number, number]; // [t_relative_ms, progress 0..1]

interface Participant {
  display_name: string;
  samples: Sample[];
}

interface Props {
  durationMs: number;
  participants: Participant[];
  snippetCode: string;
}

const COLORS = [
  "#34d399",
  "#60a5fa",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
  "#facc15",
];

/**
 * Find each participant's progress at time `t` by binary-searching their
 * sample list. Sub-millisecond cost, so scrubbing across an 8-racer
 * replay stays comfortably under one frame.
 */
function progressAt(samples: Sample[], t: number): number {
  if (samples.length === 0) return 0;
  if (t <= samples[0]![0]) return samples[0]![1];
  if (t >= samples[samples.length - 1]![0]) {
    return samples[samples.length - 1]![1];
  }
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid]![0] < t) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo]![1];
}

export function ReplayPlayer({ durationMs, participants, snippetCode }: Props) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    function tick(now: number) {
      const last = lastTickRef.current || now;
      const dt = (now - last) * speed;
      lastTickRef.current = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, durationMs]);

  return (
    <section className="space-y-4">
      <ul className="space-y-2">
        {participants.map((p, i) => {
          const pos = progressAt(p.samples, t);
          return (
            <li key={p.display_name} className="flex items-center gap-3 text-sm">
              <span className="w-32 truncate font-mono">{p.display_name}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded bg-neutral-800">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(pos * 100)}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              <span className="w-10 text-right text-xs text-neutral-400">
                {Math.round(pos * 100)}%
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            if (t >= durationMs) setT(0);
            setPlaying((p) => !p);
          }}
          className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={durationMs}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-16 text-right font-mono text-xs">
          {(t / 1000).toFixed(1)}s / {(durationMs / 1000).toFixed(1)}s
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>

      <pre className="rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs whitespace-pre-wrap">
        {snippetCode}
      </pre>
    </section>
  );
}
