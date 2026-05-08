"use client";
import type { BracketMatch } from "@/lib/api";

interface Props {
  match: BracketMatch;
  highlight?: boolean;
  onOpenLobby?: (roomId: string) => void;
}

const STATUS_COLOR: Record<BracketMatch["status"], string> = {
  pending: "bg-neutral-700 text-neutral-300",
  live: "bg-emerald-700 text-emerald-100",
  done: "bg-neutral-800 text-neutral-400",
  bye: "bg-neutral-800 text-neutral-500 italic",
  flagged: "bg-amber-700 text-amber-100",
};

export function MatchCard({ match, highlight, onOpenLobby }: Props) {
  const [a, b] = match.players;
  const winner = match.winnerId;
  const cls = `flex flex-col gap-1 rounded border px-2 py-1 text-xs ${
    highlight
      ? "border-emerald-500 ring-1 ring-emerald-500/40"
      : "border-neutral-800 bg-neutral-900"
  }`;
  return (
    <div className={cls}>
      <div className="flex items-center justify-between">
        <span className={`rounded px-1 ${STATUS_COLOR[match.status]}`}>
          {match.status}
        </span>
        <span className="text-neutral-500">
          R{match.round} · S{match.slot}
        </span>
      </div>
      <PlayerLine name={a} winner={winner === a} />
      <PlayerLine name={b} winner={winner === b} />
      {match.status === "live" && match.roomId && onOpenLobby && (
        <button
          type="button"
          onClick={() => onOpenLobby(match.roomId!)}
          className="mt-1 rounded bg-emerald-600 px-2 py-0.5 text-emerald-50 hover:bg-emerald-500"
        >
          Open lobby
        </button>
      )}
    </div>
  );
}

function PlayerLine({
  name,
  winner,
}: {
  name: string | null;
  winner: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        winner ? "font-semibold text-emerald-300" : "text-neutral-300"
      }`}
    >
      <span className="font-mono">{name ?? "—"}</span>
      {winner && <span className="text-emerald-400">✓</span>}
    </div>
  );
}
