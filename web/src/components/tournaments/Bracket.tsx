"use client";
import type { BracketMatch } from "@/lib/api";
import { MatchCard } from "./MatchCard";

interface Props {
  size: number;
  matches: BracketMatch[];
  myUserId?: string;
  onOpenLobby?: (roomId: string) => void;
}

/**
 * Pure column-per-round layout. The first round (highest round number)
 * is on the left, the final (round 0) is on the right. Slots within a
 * round retain their original order — pairing is implicit in the bracket
 * geometry (slot N pairs into parent slot floor(N/2)).
 */
export function Bracket({ size, matches, myUserId, onOpenLobby }: Props) {
  const totalRounds = Math.log2(size);
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  for (const list of byRound.values()) {
    list.sort((a, b) => a.slot - b.slot);
  }

  // Render first round on the left → final on the right.
  const columns: Array<{ round: number; matches: BracketMatch[] }> = [];
  for (let r = totalRounds - 1; r >= 0; r--) {
    columns.push({ round: r, matches: byRound.get(r) ?? [] });
  }

  return (
    <div className="flex gap-6 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.round} className="flex flex-col gap-3 min-w-[180px]">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500">
            {roundLabel(col.round, totalRounds)}
          </h3>
          {col.matches.map((m) => (
            <MatchCard
              key={`${m.round}-${m.slot}`}
              match={m}
              highlight={
                !!myUserId &&
                (m.players[0] === myUserId || m.players[1] === myUserId)
              }
              onOpenLobby={onOpenLobby}
            />
          ))}
          {col.matches.length === 0 && (
            <p className="text-xs text-neutral-500 italic">pending…</p>
          )}
        </div>
      ))}
    </div>
  );
}

function roundLabel(round: number, totalRounds: number): string {
  if (round === 0) return "Final";
  if (round === 1) return "Semis";
  if (round === 2) return "Quarters";
  return `Round ${totalRounds - round}`;
}
