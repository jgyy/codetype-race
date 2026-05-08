import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";
import type {
    BracketMatch,
    TournamentLite,
    TournamentsSink,
} from "../commands/tournaments/Tournaments";

export interface TournamentReadsSink {
    listByStatus(status: TournamentLite["status"]): Promise<TournamentLite[]>;
}

export interface MatchReadsSink {
    listAll(tournId: string): Promise<BracketMatch[]>;
}

/* ------------------- GetTournament ------------------------------------ */

export interface GetTournamentResult extends TournamentLite {
    entrantCount: number;
}

export class GetTournamentQuery extends Query<GetTournamentResult> {
    constructor(public readonly tournId: string) {
        super();
    }
}

export class GetTournamentHandler implements QueryHandler<GetTournamentQuery> {
    constructor(private readonly tournaments: TournamentsSink) { }
    async execute(q: GetTournamentQuery): Promise<GetTournamentResult> {
        const t = await this.tournaments.get(q.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        const entrants = await this.tournaments.listEntrants(q.tournId);
        return { ...t, entrantCount: entrants.length };
    }
}

/* ------------------- ListTournaments --------------------------------- */

export class ListTournamentsQuery extends Query<{ tournaments: TournamentLite[] }> {
    constructor(public readonly status: TournamentLite["status"]) {
        super();
    }
}

export class ListTournamentsHandler
    implements QueryHandler<ListTournamentsQuery> {
    constructor(private readonly reads: TournamentReadsSink) { }
    async execute(q: ListTournamentsQuery) {
        const list = await this.reads.listByStatus(q.status);
        list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return { tournaments: list };
    }
}

/* ------------------- GetTournamentBracket ---------------------------- */

export interface GetTournamentBracketResult {
    tournId: string;
    size: number;
    matches: BracketMatch[];
}

export class GetTournamentBracketQuery extends Query<GetTournamentBracketResult> {
    constructor(public readonly tournId: string) {
        super();
    }
}

export class GetTournamentBracketHandler
    implements QueryHandler<GetTournamentBracketQuery> {
    constructor(
        private readonly tournaments: TournamentsSink,
        private readonly matches: MatchReadsSink,
    ) { }
    async execute(q: GetTournamentBracketQuery): Promise<GetTournamentBracketResult> {
        const t = await this.tournaments.get(q.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        const all = await this.matches.listAll(q.tournId);
        return { tournId: q.tournId, size: t.size, matches: all };
    }
}
