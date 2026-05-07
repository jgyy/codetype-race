"use client";
import type { PlayerState } from "@/lib/machines/roomMachine";

export function PlayerList({ players }: { players: PlayerState[] }) {
  if (players.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No players yet — share the code.</p>
    );
  }
  return (
    <ul className="space-y-1 text-sm">
      {players.map((p) => (
        <li key={p.display_name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono">{p.display_name}</span>
        </li>
      ))}
    </ul>
  );
}
