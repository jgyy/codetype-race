"use client";
import type { PlayerState } from "@/lib/machines/roomMachine";
import { JoinCodeBadge } from "./JoinCodeBadge";
import { PlayerList } from "./PlayerList";
import { StartButton } from "./StartButton";

interface Props {
  code: string;
  isHost: boolean;
  players: PlayerState[];
  onStart: () => void;
}

export function Lobby({ code, isHost, players, onStart }: Props) {
  const racers = players.filter((p) => (p.role ?? "racer") === "racer");
  const spectators = players.filter((p) => p.role === "spectator");

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Lobby</h2>
      <p className="text-sm text-neutral-400">
        Share code <JoinCodeBadge code={code} />. Racers: {racers.length}
        {spectators.length > 0 && ` · Spectators: ${spectators.length}`}
      </p>
      <PlayerList players={racers} />
      {spectators.length > 0 && (
        <div className="opacity-60">
          <p className="text-xs uppercase text-neutral-500">Spectators</p>
          <PlayerList players={spectators} />
        </div>
      )}
      {isHost && <StartButton disabled={racers.length < 1} onClick={onStart} />}
    </section>
  );
}
