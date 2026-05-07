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
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Lobby</h2>
      <p className="text-sm text-neutral-400">
        Share code <JoinCodeBadge code={code} />. Players: {players.length}
      </p>
      <PlayerList players={players} />
      {isHost && <StartButton disabled={players.length < 1} onClick={onStart} />}
    </section>
  );
}
