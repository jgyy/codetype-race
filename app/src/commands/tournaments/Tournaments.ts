import {
    DomainError,
    type Clock,
    type Random,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export type TournamentStatus =
    | "registering"
    | "seeding"
    | "running"
    | "finished"
    | "cancelled";

export interface TournamentLite {
    id: string;
    name: string;
    size: number;
    language: string;
    difficulty?: number;
    status: TournamentStatus;
    startsAt: string;
    registrationClosesAt: string;
    seasonId: string | null;
    hostId: string;
    createdAt: string;
    winnerId: string | null;
}

export interface TournamentEntrant {
    tournId: string;
    userId: string;
    displayName: string;
    seedRank: number | null;
    snapshotRating: number;
    registeredAt: string;
    eliminatedAt: string | null;
    dq: boolean;
}

export interface BracketMatch {
    /** Implementation-defined; commands treat as opaque payload. */
    [k: string]: unknown;
}

export interface TournamentsSink {
    create(t: TournamentLite): Promise<void>;
    get(id: string): Promise<TournamentLite | null>;
    transitionStatus(
        id: string,
        from: TournamentStatus,
        to: TournamentStatus,
    ): Promise<boolean>;
    addEntrant(entrant: TournamentEntrant): Promise<void>;
    removeEntrant(tournId: string, userId: string): Promise<void>;
    listEntrants(tournId: string): Promise<TournamentEntrant[]>;
}

export interface SeedingOrchestrator {
    seed(args: {
        tournId: string;
        size: number;
        startsAt: string;
    }): Promise<BracketMatch[]>;
}

export interface UserProfileLookup {
    getProfile(userId: string): Promise<{
        rating: number;
        display_name: string;
    } | null>;
}

const STARTING_RATING = 1000;

/* ------------------- CreateTournament ---------------------------------- */

export interface CreateTournamentInput {
    hostId: string;
    name: string;
    size: number;
    language: string;
    difficulty?: number;
    startsAt: string;
    registrationClosesAt: string;
    seasonId: string | null;
    nowIso: string;
}

export interface CreateTournamentResult {
    id: string;
}

export class CreateTournamentCommand extends Command<CreateTournamentResult> {
    constructor(public readonly input: CreateTournamentInput) {
        super();
    }
}

export class CreateTournamentHandler
    implements CommandHandler<CreateTournamentCommand> {
    constructor(
        private readonly tournaments: TournamentsSink,
        private readonly random: Random,
    ) { }

    async execute(c: CreateTournamentCommand): Promise<CreateTournamentResult> {
        const startsAt = new Date(c.input.startsAt).getTime();
        const closesAt = new Date(c.input.registrationClosesAt).getTime();
        if (closesAt > startsAt) {
            throw new DomainError(
                "tournament.bad_window",
                400,
                "registrationClosesAt must be <= startsAt",
            );
        }
        const t: TournamentLite = {
            id: this.random.uuid(),
            name: c.input.name,
            size: c.input.size,
            language: c.input.language,
            difficulty: c.input.difficulty,
            status: "registering",
            startsAt: c.input.startsAt,
            registrationClosesAt: c.input.registrationClosesAt,
            seasonId: c.input.seasonId,
            hostId: c.input.hostId,
            createdAt: c.input.nowIso,
            winnerId: null,
        };
        await this.tournaments.create(t);
        return { id: t.id };
    }
}

/* ------------------- RegisterForTournament ----------------------------- */

export interface RegisterForTournamentInput {
    userId: string;
    tournId: string;
    nowIso: string;
}

export interface RegisterForTournamentResult {
    ok: true;
    seedSnapshot: number;
}

export class RegisterForTournamentCommand extends Command<RegisterForTournamentResult> {
    constructor(public readonly input: RegisterForTournamentInput) {
        super();
    }
}

export class RegisterForTournamentHandler
    implements CommandHandler<RegisterForTournamentCommand> {
    constructor(
        private readonly tournaments: TournamentsSink,
        private readonly users: UserProfileLookup,
        private readonly clock: Clock,
    ) { }

    async execute(c: RegisterForTournamentCommand): Promise<RegisterForTournamentResult> {
        const t = await this.tournaments.get(c.input.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        if (t.status !== "registering") {
            throw new DomainError(
                "tournament.not_open",
                409,
                `tournament not open for registration (status=${t.status})`,
            );
        }
        if (
            this.clock.epochMs() >=
            new Date(t.registrationClosesAt).getTime()
        ) {
            throw new DomainError("tournament.closed", 409);
        }
        const entrants = await this.tournaments.listEntrants(c.input.tournId);
        if (entrants.length >= t.size) {
            throw new DomainError("tournament.full", 409);
        }
        const profile = await this.users.getProfile(c.input.userId);
        const rating = profile?.rating ?? STARTING_RATING;
        const displayName = profile?.display_name ?? c.input.userId;
        await this.tournaments.addEntrant({
            tournId: c.input.tournId,
            userId: c.input.userId,
            displayName,
            seedRank: null,
            snapshotRating: rating,
            registeredAt: c.input.nowIso,
            eliminatedAt: null,
            dq: false,
        });
        return { ok: true, seedSnapshot: rating };
    }
}

/* ------------------- SeedTournament ------------------------------------ */

export interface SeedTournamentInput {
    tournId: string;
}

export interface SeedTournamentResult {
    tournId: string;
    size: number;
    matches: BracketMatch[];
}

export class SeedTournamentCommand extends Command<SeedTournamentResult> {
    constructor(public readonly input: SeedTournamentInput) {
        super();
    }
}

export class SeedTournamentHandler
    implements CommandHandler<SeedTournamentCommand> {
    constructor(
        private readonly tournaments: TournamentsSink,
        private readonly seeder: SeedingOrchestrator,
    ) { }

    async execute(c: SeedTournamentCommand): Promise<SeedTournamentResult> {
        const t = await this.tournaments.get(c.input.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        const moved = await this.tournaments.transitionStatus(
            c.input.tournId,
            "registering",
            "seeding",
        );
        if (!moved) {
            throw new DomainError(
                "tournament.cant_seed",
                409,
                `cannot seed from status=${t.status}`,
            );
        }
        const written = await this.seeder.seed({
            tournId: c.input.tournId,
            size: t.size,
            startsAt: t.startsAt,
        });
        await this.tournaments.transitionStatus(
            c.input.tournId,
            "seeding",
            "running",
        );
        return { tournId: c.input.tournId, size: t.size, matches: written };
    }
}

/* ------------------- WithdrawFromTournament ---------------------------- */

export interface WithdrawFromTournamentInput {
    userId: string;
    tournId: string;
}

export interface WithdrawFromTournamentResult {
    ok: true;
}

export class WithdrawFromTournamentCommand extends Command<WithdrawFromTournamentResult> {
    constructor(public readonly input: WithdrawFromTournamentInput) {
        super();
    }
}

export class WithdrawFromTournamentHandler
    implements CommandHandler<WithdrawFromTournamentCommand> {
    constructor(private readonly tournaments: TournamentsSink) { }

    async execute(c: WithdrawFromTournamentCommand): Promise<WithdrawFromTournamentResult> {
        const t = await this.tournaments.get(c.input.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        if (t.status !== "registering") {
            throw new DomainError(
                "tournament.cant_withdraw",
                409,
                "can only withdraw before seeding",
            );
        }
        await this.tournaments.removeEntrant(c.input.tournId, c.input.userId);
        return { ok: true };
    }
}

/* ------------------- CancelTournament ---------------------------------- */

export interface CancelTournamentInput {
    tournId: string;
}

export interface CancelTournamentResult {
    ok: true;
}

export class CancelTournamentCommand extends Command<CancelTournamentResult> {
    constructor(public readonly input: CancelTournamentInput) {
        super();
    }
}

export class CancelTournamentHandler
    implements CommandHandler<CancelTournamentCommand> {
    constructor(private readonly tournaments: TournamentsSink) { }

    async execute(c: CancelTournamentCommand): Promise<CancelTournamentResult> {
        const t = await this.tournaments.get(c.input.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        if (t.status === "finished" || t.status === "cancelled") {
            throw new DomainError(
                "tournament.terminal",
                409,
                `already ${t.status}`,
            );
        }
        const ok = await this.tournaments.transitionStatus(
            c.input.tournId,
            t.status,
            "cancelled",
        );
        if (!ok) {
            throw new DomainError(
                "tournament.race",
                409,
                "status changed concurrently; retry",
            );
        }
        return { ok: true };
    }
}
