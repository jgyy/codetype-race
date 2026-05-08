"use client";
import { useState } from "react";
import type { RoomTeamInput } from "@/lib/api";

const DEFAULT_COLORS: Record<string, string> = {
  A: "#ef4444",
  B: "#3b82f6",
  C: "#10b981",
  D: "#f59e0b",
};

export interface TeamSetupValue {
  enabled: boolean;
  teams: RoomTeamInput[];
}

export function TeamSetup({
  value,
  onChange,
  hostUserId,
}: {
  value: TeamSetupValue;
  onChange: (v: TeamSetupValue) => void;
  hostUserId: string | null;
}) {
  const [count, setCount] = useState<2 | 3 | 4>(
    (value.teams.length as 2 | 3 | 4) || 2,
  );

  function ensureTeams(n: 2 | 3 | 4) {
    const ids: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
    const next: RoomTeamInput[] = ids.slice(0, n).map((id, i) => {
      const existing = value.teams[i];
      return (
        existing ?? {
          id,
          name: `Team ${id}`,
          color: DEFAULT_COLORS[id]!,
          members: id === "A" && hostUserId ? [hostUserId] : [],
        }
      );
    });
    onChange({ ...value, teams: next });
  }

  return (
    <div className="rounded border border-zinc-800 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            onChange({
              enabled,
              teams: enabled && value.teams.length === 0
                ? [
                    {
                      id: "A",
                      name: "Team A",
                      color: DEFAULT_COLORS.A!,
                      members: hostUserId ? [hostUserId] : [],
                    },
                    { id: "B", name: "Team B", color: DEFAULT_COLORS.B!, members: [] },
                  ]
                : value.teams,
            });
          }}
        />
        <span>Team mode</span>
      </label>

      {value.enabled ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-zinc-400">
            Number of teams
            <select
              className="ml-2 rounded border border-zinc-800 bg-zinc-900 p-1 text-xs"
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value) as 2 | 3 | 4;
                setCount(n);
                ensureTeams(n);
              }}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          {value.teams.map((t, i) => (
            <div
              key={t.id}
              className="rounded border border-zinc-800 p-2 text-xs"
              style={{ borderLeft: `4px solid ${t.color}` }}
            >
              <input
                value={t.name}
                onChange={(e) => {
                  const next = [...value.teams];
                  next[i] = { ...t, name: e.target.value };
                  onChange({ ...value, teams: next });
                }}
                className="w-full rounded border border-zinc-800 bg-zinc-900 p-1"
              />
              <textarea
                placeholder="member user IDs (one per line, max 2)"
                value={t.members.join("\n")}
                onChange={(e) => {
                  const ids = e.target.value
                    .split(/\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 2);
                  const next = [...value.teams];
                  next[i] = { ...t, members: ids };
                  onChange({ ...value, teams: next });
                }}
                rows={2}
                className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 p-1"
              />
            </div>
          ))}
          <p className="text-xs text-zinc-500">
            v1: paste user IDs from <code>/profile?id=…</code>. A drag-and-drop
            picker lands in slice 4.
          </p>
        </div>
      ) : null}
    </div>
  );
}
