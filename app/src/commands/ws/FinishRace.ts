import {
    DomainError,
    type Broadcaster,
    type Clock,
    type ConnectionRepo,
    type RoomRepo,
    type SeedPlayer,
    type SnippetRepo,
} from "@codetype/domain";
import { InMemoryUnitOfWork } from "../../uow/InMemoryUnitOfWork";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/domain/wpm";
import {
    computeRatingDeltas,
    type RaceParticipant,
} from "@codetype/domain/elo";
import { evaluateStats, isFlagged } from "@codetype/domain/anticheat";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";

export interface FinishRaceInput {
    connectionId: string;
    chars_typed: number;
    errors: number;
}

export class FinishRaceCommand extends Command<void> {
    constructor(public readonly input: FinishRaceInput) {
        super();
    }
}

export interface UserProfileLite {
    user_id?: string;
    rating: number;
    best_wpm?: Record<string, number>;
}

export interface AppliedDelta {
    userId: string;
    displayName: string;
    delta: number;
    newRating: number;
}

export interface RaceResultInput {
    userId: string;
    displayName: string;
    language: string;
    finishOrder: number;
    scaledWpm: number;
    netWpm: number;
    grossWpm: number;
    accuracy: number;
    profile: UserProfileLite;
    delta: number;
}

export interface UserRatingsApplier {
    getOrCreate(userId: string, displayName: string): Promise<UserProfileLite>;
    applyRaceResults(
        roomId: string,
        language: string,
        participants: RaceResultInput[],
    ): Promise<AppliedDelta[]>;
}

export interface FeedAppender {
    append(
        userId: string,
        type: string,
        payload: Record<string, unknown>,
    ): Promise<void>;
}

export interface TeamLite {
    id: string;
    members: string[];
}

export interface TeamRoomReader {
    listTeams(roomId: string): Promise<TeamLite[]>;
}

export interface TeamRatingRowLite {
    rating: number;
}

export interface TeamRatingApplyItem {
    userId: string;
    displayName: string;
    language: string;
    delta: number;
    oldRating: number;
}

export interface TeamRatingApplier {
    getOrInit(
        userId: string,
        displayName: string,
        language: string,
    ): Promise<TeamRatingRowLite>;
    buildApplyItems(
        roomId: string,
        applies: TeamRatingApplyItem[],
    ): unknown[];
    sendTransaction(items: unknown[]): Promise<void>;
}

interface FinishedPlayer extends SeedPlayer {
    role?: "racer" | "spectator";
    is_dnf?: boolean;
    finished_at?: number;
    scaled_wpm?: number;
    net_wpm?: number;
    gross_wpm?: number;
    accuracy?: number;
    user_id: string;
}

export interface RaceFinishedEmitter {
    emitRaceFinished(roomId: string, ts: number, durationMs: number): void;
}

export interface AntiCheatMetrics {
    onFlag(code: string): void;
}

export class FinishRaceHandler implements CommandHandler<FinishRaceCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly connections: ConnectionRepo,
        private readonly snippets: SnippetRepo,
        private readonly users: UserRatingsApplier,
        private readonly teamRoom: TeamRoomReader,
        private readonly teamRatings: TeamRatingApplier,
        private readonly feed: FeedAppender,
        private readonly broadcaster: Broadcaster,
        private readonly clock: Clock,
        private readonly metrics: RaceFinishedEmitter & AntiCheatMetrics,
        private readonly buildTeamHistoryItems: (args: {
            roomId: string;
            language: string;
            now: number;
            rated: FinishedPlayer[];
            teamOf: Map<string, string>;
            winnerId: string;
        }) => unknown[],
    ) { }

    async execute(c: FinishRaceCommand): Promise<void> {
        const { connectionId } = c.input;
        const conn = await this.connections.byConnectionId(connectionId);
        if (!conn) throw new DomainError("connection.not_found", 404);
        if ((conn.role ?? "racer") === "spectator") {
            throw new DomainError("finish.forbidden", 403);
        }
        const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
        const displayName = conn.display_name;

        const room = await this.rooms.getById(roomId);
        if (!room?.started_at) {
            throw new DomainError("race.not_started", 409);
        }

        const snippet = await this.snippets.getMetaById(room.snippet_id);
        if (!snippet) throw new DomainError("snippet.not_found", 404);
        if (c.input.chars_typed < snippet.length) {
            throw new DomainError("finish.incomplete", 400);
        }

        const finishedAt = this.clock.epochMs();
        const elapsedMs = finishedAt - room.started_at;
        const gross = grossWpm(c.input.chars_typed, elapsedMs);
        const net = netWpm(c.input.chars_typed, c.input.errors, elapsedMs);
        const acc = accuracy(c.input.chars_typed, c.input.errors);
        const scaled = scaledWpm(c.input.chars_typed, c.input.errors, elapsedMs);

        const flags = evaluateStats({
            snippetLength: snippet.length,
            durationMs: elapsedMs,
            charsTyped: c.input.chars_typed,
        });
        const flagged = isFlagged(flags);
        for (const f of flags) this.metrics.onFlag(f.code);
        this.metrics.emitRaceFinished(roomId, finishedAt, elapsedMs);

        await this.rooms.recordFinish({
            roomId,
            hostId: room.host_id,
            displayName,
            finishedAt,
            charsTyped: c.input.chars_typed,
            errors: c.input.errors,
            grossWpm: gross,
            netWpm: net,
            accuracy: acc,
            scaledWpm: scaled,
            flagged,
            flags,
        });

        if (flagged) return;

        if (room.mode === "team") {
            await this.maybeApplyTeamRatings(roomId, snippet.language);
        } else {
            await this.maybeApplySoloRatings(roomId, snippet.language);
        }
    }

    private async maybeApplySoloRatings(
        roomId: string,
        language: string,
    ): Promise<void> {
        const allPlayers = (await this.rooms.listPlayers(roomId)) as FinishedPlayer[];
        const racers = allPlayers.filter((p) => (p.role ?? "racer") === "racer");
        if (racers.length === 0) return;
        const finished = racers.filter(
            (p) => p.finished_at !== undefined && !p.is_dnf,
        );
        if (finished.length !== racers.length) return;

        const ranked = [...finished].sort(
            (a, b) =>
                (b.scaled_wpm ?? 0) - (a.scaled_wpm ?? 0) ||
                (a.finished_at ?? 0) - (b.finished_at ?? 0),
        );
        const rated = ranked
            .filter((p) => !!p.user_id)
            .map((p, i) => ({ player: p, finishOrder: i + 1 }));
        if (rated.length < 2) return;

        const profiles = await Promise.all(
            rated.map((r) =>
                this.users.getOrCreate(r.player.user_id, r.player.display_name),
            ),
        );

        const ps: RaceParticipant[] = rated.map((r, i) => ({
            userId: r.player.user_id,
            rating: profiles[i]!.rating,
            finishOrder: r.finishOrder,
        }));
        const deltas = computeRatingDeltas(ps);

        let applied: AppliedDelta[];
        try {
            applied = await this.users.applyRaceResults(
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
        } catch (e: unknown) {
            if ((e as { name?: string })?.name === "TransactionCanceledException") return;
            throw e;
        }

        const peers = await this.connections.listByRoom(roomId);
        const payload = {
            type: "ratings" as const,
            entries: applied.map((a) => ({
                user_id: a.userId,
                display_name: a.displayName,
                delta: a.delta,
                rating_after: a.newRating,
            })),
        };
        await Promise.all(peers.map((id) => this.broadcaster.postTo(id, payload)));
        await Promise.all(
            applied.map((a) =>
                this.feed.append(a.userId, "raced", {
                    room_id: roomId,
                    language,
                    rating_after: a.newRating,
                    rating_delta: a.delta,
                }),
            ),
        );
    }

    private async maybeApplyTeamRatings(
        roomId: string,
        language: string,
    ): Promise<void> {
        const [allPlayers, teams] = await Promise.all([
            this.rooms.listPlayers(roomId) as Promise<FinishedPlayer[]>,
            this.teamRoom.listTeams(roomId),
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
            (p) => !!p.user_id && teamOf.has(p.user_id),
        );
        if (rated.length === 0) return;

        const teamScores = new Map<
            string,
            { score: number; maxFinishedAt: number }
        >();
        for (const p of rated) {
            const tid = teamOf.get(p.user_id)!;
            const existing = teamScores.get(tid) ?? { score: 0, maxFinishedAt: 0 };
            existing.score += p.scaled_wpm ?? 0;
            existing.maxFinishedAt = Math.max(
                existing.maxFinishedAt,
                p.finished_at ?? 0,
            );
            teamScores.set(tid, existing);
        }
        const ranking = [...teamScores.entries()]
            .map(([teamId, s]) => ({
                teamId,
                score: s.score,
                maxFinishedAt: s.maxFinishedAt,
            }))
            .sort(
                (a, b) =>
                    b.score - a.score || a.maxFinishedAt - b.maxFinishedAt,
            );
        const winnerId = ranking[0]!.teamId;

        const now = this.clock.epochMs();
        // UnitOfWork collects every transactional item the team-mode
        // path emits (idempotency Update, history Puts, rating
        // Updates) and flushes them as a single TransactWriteItems.
        const uow = new InMemoryUnitOfWork();
        for (const item of this.buildTeamHistoryItems({
            roomId,
            language,
            now,
            rated,
            teamOf,
            winnerId,
        })) {
            uow.enqueue(item);
        }

        let appliedDeltas: AppliedDelta[] = [];

        if (teams.length === 2) {
            const winnerTeam = teams.find((t) => t.id === winnerId)!;
            const loserTeam = teams.find((t) => t.id !== winnerId)!;
            const fetchMembers = async (memberIds: string[]) =>
                Promise.all(
                    memberIds
                        .filter((m) => rated.some((r) => r.user_id === m))
                        .map(async (m) => {
                            const row = await this.teamRatings.getOrInit(
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
                const teamDeltas = await import("@codetype/shared/team-elo").then(
                    (m) =>
                        m.computeTeamRatingDeltas(
                            { teamId: winnerTeam.id, members: wMembers },
                            { teamId: loserTeam.id, members: lMembers },
                        ),
                );
                const oldRatingFor = (uid: string) =>
                    [...wMembers, ...lMembers].find((m) => m.userId === uid)!
                        .rating;
                const ratingItems = this.teamRatings.buildApplyItems(
                    roomId,
                    teamDeltas.map((d) => ({
                        userId: d.userId,
                        displayName: rated.find((r) => r.user_id === d.userId)!
                            .display_name,
                        language,
                        delta: d.delta,
                        oldRating: oldRatingFor(d.userId),
                    })),
                );
                for (const item of ratingItems.slice(1)) uow.enqueue(item);
                appliedDeltas = teamDeltas.map((d) => ({
                    userId: d.userId,
                    displayName: rated.find((r) => r.user_id === d.userId)!
                        .display_name,
                    delta: d.delta,
                    newRating: oldRatingFor(d.userId) + d.delta,
                }));
            }
        }

        try {
            await uow.flush((items) => this.teamRatings.sendTransaction(items));
        } catch (e: unknown) {
            if ((e as { name?: string })?.name === "TransactionCanceledException") return;
            throw e;
        }

        const peers = await this.connections.listByRoom(roomId);
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
                rating_after: a.newRating,
            })),
        };
        await Promise.all(peers.map((id) => this.broadcaster.postTo(id, payload)));
        await Promise.all(
            rated.map((p) =>
                this.feed.append(p.user_id, "raced", {
                    room_id: roomId,
                    language,
                    team_id: teamOf.get(p.user_id),
                    won: teamOf.get(p.user_id) === winnerId,
                }),
            ),
        );
    }
}
