"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    friendlyMessage,
    getTournament,
    getTournamentBracket,
    type BracketMatch,
    type TournamentDetail,
} from "@/lib/api";
import { Bracket } from "@/components/tournaments/Bracket";
import { Trophy } from "@/components/icons/Medal";
import { WS_TOURN_API } from "@/lib/config";
import { getCurrentUser } from "@/lib/aws/cognito";

function BracketView() {
    const params = useSearchParams();
    const router = useRouter();
    const id = params.get("id") ?? "";
    const [t, setT] = useState<TournamentDetail | null>(null);
    const [matches, setMatches] = useState<BracketMatch[]>([]);
    const [me, setMe] = useState<string | undefined>();
    const [err, setErr] = useState<string | null>(null);
    const [winner, setWinner] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        Promise.all([getTournament(id), getTournamentBracket(id)])
            .then(([detail, bracket]) => {
                setT(detail);
                setMatches(bracket.matches);
                if (detail.winnerId) setWinner(detail.winnerId);
            })
            .catch((e) => setErr(friendlyMessage(e)));

        getCurrentUser()
            .then((u) => setMe(u?.userId))
            .catch(() => { });
    }, [id]);

    // Plain WebSocket — `tournamentActor` is the XState wrapper available
    // for callers that need to invoke it from a parent machine.
    useEffect(() => {
        if (!id || !WS_TOURN_API) return;
        const qs = new URLSearchParams({ tournId: id });
        if (me) qs.set("userId", me);
        const ws = new WebSocket(`${WS_TOURN_API}?${qs.toString()}`);
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        ws.onopen = () => {
            heartbeat = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "HEARTBEAT" }));
                }
            }, 25_000);
        };

        ws.onmessage = (e) => {
            let msg: { type: string;[k: string]: unknown };
            try {
                msg = JSON.parse(typeof e.data === "string" ? e.data : "");
            } catch {
                return;
            }
            switch (msg.type) {
                case "BRACKET_INIT":
                    setMatches((msg.matches as BracketMatch[]) ?? []);
                    break;
                case "BRACKET_UPDATE": {
                    const m = msg.match as BracketMatch;
                    setMatches((cur) => {
                        const filtered = cur.filter(
                            (x) => !(x.round === m.round && x.slot === m.slot),
                        );
                        return [...filtered, m];
                    });
                    break;
                }
                case "MATCH_READY":
                    router.push(
                        `/room?code=${encodeURIComponent(String(msg.roomId))}`,
                    );
                    break;
                case "TOURNAMENT_FINISHED":
                    setWinner(String(msg.winnerId));
                    break;
            }
        };

        return () => {
            if (heartbeat) clearInterval(heartbeat);
            ws.close();
        };
    }, [id, me, router]);

    if (!id) return <p className="p-6 text-sm">Missing tournament id.</p>;
    if (err) return <p className="p-6 text-sm text-red-400">{err}</p>;
    if (!t) return <p className="p-6 text-sm">Loading…</p>;

    return (
        <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">{t.name}</h1>
                <Link
                    href={`/tournaments/detail?id=${encodeURIComponent(id)}`}
                    className="text-sm text-neutral-400 hover:underline"
                >
                    ← Detail
                </Link>
            </header>

            {winner && (
                <div className="flex items-center gap-2 rounded border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm">
                    <Trophy className="text-base" />
                    <span>Winner: <span className="font-mono">{winner}</span></span>
                </div>
            )}

            <Bracket
                size={t.size}
                matches={matches}
                myUserId={me}
                onOpenLobby={(roomId) =>
                    router.push(`/room?code=${encodeURIComponent(roomId)}`)
                }
            />
        </main>
    );
}

export default function Page() {
    return (
        <Suspense>
            <BracketView />
        </Suspense>
    );
}
