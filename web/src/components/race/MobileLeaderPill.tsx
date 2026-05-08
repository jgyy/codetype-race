"use client";
import { useState } from "react";
import { Leaderboard } from "./Leaderboard";

interface Player {
    id: string;
    display_name: string;
    progress: number;
    finished_at?: number;
    scaled_wpm?: number;
}

export function MobileLeaderPill({
    players,
    selfName,
}: {
    players: Player[];
    selfName?: string;
}) {
    const [open, setOpen] = useState(false);

    const sorted = [...players].sort((a, b) => {
        if (a.finished_at && b.finished_at) return (b.scaled_wpm ?? 0) - (a.scaled_wpm ?? 0);
        if (a.finished_at) return -1;
        if (b.finished_at) return 1;
        return b.progress - a.progress;
    });
    const leader = sorted[0];
    const self = selfId ? players.find((p) => p.id === selfId) : undefined;

    return (
        <section aria-label="Race status" className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">
                    <span className="text-neutral-400">Leader: </span>
                    <span className="font-semibold">{leader?.display_name ?? "—"}</span>
                    {leader && (
                        <span className="ml-2 text-neutral-400">
                            {leader.finished_at
                                ? `${Math.round(leader.scaled_wpm ?? 0)} wpm`
                                : `${Math.round(leader.progress * 100)}%`}
                        </span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls="mobile-race-leaderboard"
                    className="min-h-11 min-w-11 rounded border border-neutral-700 px-3 text-xs hover:bg-neutral-800"
                >
                    {open ? "Less" : "More"}
                </button>
            </div>

            {self && (
                <div className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-neutral-400">You</span>
                    <div className="flex-1 h-3 rounded bg-neutral-800 overflow-hidden">
                        <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.round(self.progress * 100)}%` }}
                        />
                    </div>
                    <span className="w-12 text-right text-xs text-neutral-400">
                        {Math.round(self.progress * 100)}%
                    </span>
                </div>
            )}

            {open && (
                <div id="mobile-race-leaderboard" className="rounded border border-neutral-800 p-2">
                    <Leaderboard players={players} />
                </div>
            )}
        </section>
    );
}
