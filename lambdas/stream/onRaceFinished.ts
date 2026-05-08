import type { DynamoDBStreamHandler } from "aws-lambda";
import { withStream } from "../src/middleware";
import { matches } from "../src/repos/MatchRepo";
import { tournaments } from "../src/repos/TournamentRepo";
import { rooms } from "../src/repos/RoomRepo";
import { advanceMatch } from "../src/orchestration/advanceMatch";

/**
 * Stream handler that watches PLAYER# rows for `finished_at` writes. When
 * the player's room is tied to a tournament match, advance the bracket.
 *
 * The room metadata carries `tourn_match_key` of the form
 * `<tournId>#<round>#<slot>` once a tournament-scheduled room is created.
 * Rooms without that field are ignored (regular casual races flow through
 * the broadcast handler instead).
 */

interface FinishContext {
    roomId: string;
    displayName: string;
    finishedAt: number;
    isWinner: boolean;
}

function parseFinish(record: any): FinishContext | null {
    const keys = record.dynamodb?.Keys;
    const newImg = record.dynamodb?.NewImage;
    const pk: string | undefined = keys?.PK?.S;
    const sk: string | undefined = keys?.SK?.S;
    if (!pk?.startsWith("ROOM#")) return null;
    if (!sk?.startsWith("PLAYER#")) return null;
    if (!newImg?.finished_at?.N) return null;
    return {
        roomId: pk.slice("ROOM#".length),
        displayName: newImg.display_name?.S ?? "",
        finishedAt: Number(newImg.finished_at.N),
        isWinner: false, // determined below by reading room state
    };
}

interface TournMatchKey {
    tournId: string;
    round: number;
    slot: number;
}

function parseTournMatchKey(raw: string | undefined): TournMatchKey | null {
    if (!raw) return null;
    const parts = raw.split("#");
    if (parts.length !== 3) return null;
    const round = Number(parts[1]);
    const slot = Number(parts[2]);
    if (!Number.isFinite(round) || !Number.isFinite(slot)) return null;
    return { tournId: parts[0]!, round, slot };
}

export const handler: DynamoDBStreamHandler = withStream(async (event) => {
    const finishes = event.Records.map(parseFinish).filter(
        (f): f is FinishContext => f !== null,
    );
    if (finishes.length === 0) return;

    // Group by room so we resolve each room's winner exactly once.
    const byRoom = new Map<string, FinishContext[]>();
    for (const f of finishes) {
        if (!byRoom.has(f.roomId)) byRoom.set(f.roomId, []);
        byRoom.get(f.roomId)!.push(f);
    }

    for (const [roomId, _events] of byRoom.entries()) {
        const room = await rooms.getMeta(roomId);
        if (!room) continue;
        const matchKey = parseTournMatchKey(
            (room as { tourn_match_key?: string }).tourn_match_key,
        );
        if (!matchKey) continue;

        // Pick the player with the lowest finish time as winner.
        const players = await rooms.listPlayers(roomId);
        const finished = players.filter((p) => p.finished_at);
        if (finished.length === 0) continue;
        finished.sort((a, b) => (a.finished_at ?? 0) - (b.finished_at ?? 0));
        const winner = finished[0]!;
        if (!winner.user_id) continue;

        // CAS-transition match to live first so a pending match becomes
        // advanceable; if it's already live (already scheduled by seed
        // logic) this is a no-op for status.
        await matches.transitionStatus(
            matchKey.tournId,
            matchKey.round,
            matchKey.slot,
            "pending",
            "live",
        );

        await advanceMatch({
            tournId: matchKey.tournId,
            round: matchKey.round,
            slot: matchKey.slot,
            winnerId: winner.user_id,
            matches,
            tournaments,
        });
    }
});
