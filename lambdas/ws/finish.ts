import type { z } from "zod";
import type { WsFinishSchema } from "@codetype/shared/schemas";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/shared/wpm";
import { computeRatingDeltas, type RaceParticipant } from "@codetype/shared/elo";
import { evaluateStats, isFlagged } from "@codetype/shared/anticheat";
import { metrics } from "../src/metrics";
import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";
import { snippets } from "../src/repos/SnippetRepo";
import { users } from "../src/repos/UserRepo";
import { teamRatings } from "../src/repos/TeamRatingRepo";
import { teamRooms } from "../src/repos/TeamRoomRepo";
import { feed } from "../src/repos/FeedRepo";
import { computeTeamRatingDeltas } from "@codetype/shared/team-elo";
import { rankTeams, type TeamPlayerResult } from "@codetype/shared/team-scoring";
import { userPK, userRaceSK } from "@codetype/shared/ddb-keys";
import { TABLE } from "../src/ddb";
import { postTo } from "../src/wsClient";

type FinishMsg = z.infer<typeof WsFinishSchema>;

export async function applyFinish(
    input: FinishMsg,
    connectionId: string,
): Promise<void> {
    const conn = await connections.byConnectionId(connectionId);
    if (!conn) throw Errors.NotFound("connection");
    if ((conn.role ?? "racer") === "spectator") {
        throw Errors.Forbidden();
    }
    const roomId = conn.PK.slice("ROOM#".length);
    const displayName = conn.display_name;

    const room = await rooms.getMeta(roomId);
    if (!room?.started_at) throw Errors.Conflict("not started");

    const snippet = await snippets.getById(room.snippet_id);
    if (!snippet) throw Errors.NotFound("snippet");
    if (input.chars_typed < snippet.length) {
        throw Errors.BadRequest("incomplete");
    }

    const finishedAt = Date.now();
    const elapsedMs = finishedAt - room.started_at;
    const gross = grossWpm(input.chars_typed, elapsedMs);
    const net = netWpm(input.chars_typed, input.errors, elapsedMs);
    const acc = accuracy(input.chars_typed, input.errors);
    const scaled = scaledWpm(input.chars_typed, input.errors, elapsedMs);

    const flags = evaluateStats({
        snippetLength: snippet.length,
        durationMs: elapsedMs,
        charsTyped: input.chars_typed,
    });
    const flagged = isFlagged(flags);
    for (const f of flags) metrics.antiCheatFlag(f.code);
    metrics.raceFinished(elapsedMs);

    await rooms.recordFinish({
        roomId,
        hostId: room.host_id,
        displayName,
        finishedAt,
        charsTyped: input.chars_typed,
        errors: input.errors,
        grossWpm: gross,
        netWpm: net,
        accuracy: acc,
        scaledWpm: scaled,
        flagged,
        flags,
    });

    if (!flagged) {
        if ((room as { mode?: string }).mode === "team") {
            await maybeApplyTeamRatings(roomId, snippet.language);
        } else {
            await maybeApplyRatings(roomId, snippet.language);
        }
    }
}

async function maybeApplyRatings(
    roomId: string,
    language: string,
): Promise<void> {
    const allPlayers = await rooms.listPlayers(roomId);
    const racers = allPlayers.filter((p) => (p.role ?? "racer") === "racer");
    if (racers.length === 0) return;
    const finishedRacers = racers.filter(
        (p) => p.finished_at !== undefined && !p.is_dnf,
    );
    if (finishedRacers.length !== racers.length) return;

    const ranked = [...finishedRacers].sort(
        (a, b) =>
            (b.scaled_wpm ?? 0) - (a.scaled_wpm ?? 0) ||
            (a.finished_at ?? 0) - (b.finished_at ?? 0),
    );

    const rated = ranked
        .filter((p): p is typeof p & { user_id: string } => !!p.user_id)
        .map((p, i) => ({
            player: p,
            finishOrder: i + 1,
        }));
    if (rated.length < 2) return;

    const profiles = await Promise.all(
        rated.map((r) => users.getOrCreate(r.player.user_id, r.player.display_name)),
    );

    const ps: RaceParticipant[] = rated.map((r, i) => ({
        userId: r.player.user_id,
        rating: profiles[i]!.rating,
        finishOrder: r.finishOrder,
    }));
    const deltas = computeRatingDeltas(ps);

    let applied;
    try {
        applied = await users.applyRaceResults(
            roomId,
            language,
            rated.map((r, i) => ({
                userId: r.player.user_id,
                displayName: r.player.display_name,
                language,
                finishOrder: r.finishOrder,
                scaledWpm: r.player.scaled_wpm ?? 0,
                netWpm: r.player.net_wpm ?? 0,
                grossWpm: r.player.gross_wpm ?? 0,
                accuracy: r.player.accuracy ?? 0,
                profile: profiles[i]!,
                delta: deltas[r.player.user_id] ?? 0,
            })),
        );
    } catch (e: any) {
        if (e?.name === "TransactionCanceledException") return;
        throw e;
    }

    const conns = await connections.listByRoom(roomId);
    const payload = {
        type: "ratings" as const,
        entries: applied.map((a) => ({
            user_id: a.userId,
            display_name: a.displayName,
            delta: a.delta,
            rating_after: a.newRating,
        })),
    };
    await Promise.all(conns.map((id) => postTo(id, payload).catch(() => false)));
    await Promise.all(
        applied.map((a) =>
            feed.append(a.userId, "raced", {
                room_id: roomId,
                language,
                rating_after: a.newRating,
                rating_delta: a.delta,
            }),
        ),
    );
}

async function maybeApplyTeamRatings(
    roomId: string,
    language: string,
): Promise<void> {
    const [allPlayers, teams] = await Promise.all([
        rooms.listPlayers(roomId),
        teamRooms.listTeams(roomId),
    ]);
    const racers = allPlayers.filter((p) => (p.role ?? "racer") === "racer");
    if (racers.length === 0 || teams.length < 2) return;
    const finished = racers.filter(
        (p) => p.finished_at !== undefined && !p.is_dnf,
    );
    if (finished.length !== racers.length) return;

    const teamOf = new Map<string, string>();
    for (const t of teams) {
        for (const m of t.members) teamOf.set(m, t.id);
    }
    const rated = finished.filter(
        (p): p is typeof p & { user_id: string } =>
            !!p.user_id && teamOf.has(p.user_id),
    );
    if (rated.length === 0) return;

    const results: TeamPlayerResult[] = rated.map((p) => ({
        userId: p.user_id,
        teamId: teamOf.get(p.user_id)!,
        wpm: p.scaled_wpm ?? 0,
        accuracy: p.accuracy ?? 0,
        finishedAt: p.finished_at ?? 0,
    }));
    const ranking = rankTeams(teams, results);
    const winnerId = ranking[0]!.teamId;

    const now = Date.now();
    const historyItems = rated.map((p) => ({
        Put: {
            TableName: TABLE,
            Item: {
                PK: userPK(p.user_id),
                SK: userRaceSK(now, roomId),
                room_id: roomId,
                finished_at: now,
                display_name: p.display_name,
                language,
                scaled_wpm: p.scaled_wpm ?? 0,
                net_wpm: p.net_wpm ?? 0,
                gross_wpm: p.gross_wpm ?? 0,
                accuracy: p.accuracy ?? 0,
                mode: "team",
                team_id: teamOf.get(p.user_id),
                won: teamOf.get(p.user_id) === winnerId,
            },
        },
    }));

    let txItems: any[] = [
        {
            Update: {
                TableName: TABLE,
                Key: { PK: `ROOM#${roomId}`, SK: "META" },
                UpdateExpression: "SET team_elo_applied = :t",
                ConditionExpression: "attribute_not_exists(team_elo_applied)",
                ExpressionAttributeValues: { ":t": true },
            },
        },
        ...historyItems,
    ];

    let appliedDeltas: Array<{
        userId: string;
        displayName: string;
        delta: number;
        ratingAfter: number;
    }> = [];

    if (teams.length === 2) {
        const winnerTeam = teams.find((t) => t.id === winnerId)!;
        const loserTeam = teams.find((t) => t.id !== winnerId)!;
        const fetchMembers = async (memberIds: string[]) =>
            Promise.all(
                memberIds
                    .filter((m) => rated.some((r) => r.user_id === m))
                    .map(async (m) => {
                        const row = await teamRatings.getOrInit(
                            m,
                            rated.find((r) => r.user_id === m)!.display_name,
                            language,
                        );
                        return { userId: m, rating: row.rating };
                    }),
            );
        const [wMembers, lMembers] = await Promise.all([
            fetchMembers(winnerTeam.members),
            fetchMembers(loserTeam.members),
        ]);
        if (wMembers.length > 0 && lMembers.length > 0) {
            const deltas = computeTeamRatingDeltas(
                { teamId: winnerTeam.id, members: wMembers },
                { teamId: loserTeam.id, members: lMembers },
            );
            const oldRatingFor = (uid: string) =>
                [...wMembers, ...lMembers].find((m) => m.userId === uid)!.rating;
            const ratingItems = teamRatings.buildApplyItems(
                roomId,
                deltas.map((d) => ({
                    userId: d.userId,
                    displayName: rated.find((r) => r.user_id === d.userId)!
                        .display_name,
                    language,
                    delta: d.delta,
                    oldRating: oldRatingFor(d.userId),
                })),
            );
            txItems = [...txItems, ...ratingItems.slice(1)];
            appliedDeltas = deltas.map((d) => ({
                userId: d.userId,
                displayName: rated.find((r) => r.user_id === d.userId)!
                    .display_name,
                delta: d.delta,
                ratingAfter: oldRatingFor(d.userId) + d.delta,
            }));
        }
    }

    try {
        await teamRatings.sendTransaction(txItems);
    } catch (e: any) {
        if (e?.name === "TransactionCanceledException") return;
        throw e;
    }

    const conns = await connections.listByRoom(roomId);
    const payload = {
        type: "team-result" as const,
        winner_team_id: winnerId,
        ranking: ranking.map((r) => ({
            team_id: r.teamId,
            score: r.score,
            max_finished_at: r.maxFinishedAt,
        })),
        ratings: appliedDeltas.map((a) => ({
            user_id: a.userId,
            display_name: a.displayName,
            delta: a.delta,
            rating_after: a.ratingAfter,
        })),
    };
    await Promise.all(conns.map((id) => postTo(id, payload).catch(() => false)));
    await Promise.all(
        rated.map((p) =>
            feed.append(p.user_id, "raced", {
                room_id: roomId,
                language,
                team_id: teamOf.get(p.user_id),
                won: teamOf.get(p.user_id) === winnerId,
            }),
        ),
    );
}
