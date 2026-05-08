import { DomainError } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

/** Sinks satisfied by the legacy TournConnectionRepo + MatchRepo. */
export interface TournConnectionsSink {
    put(tournId: string, connectionId: string, userId: string): Promise<void>;
    byConnectionId(connectionId: string): Promise<{
        tourn_id: string;
        user_id: string;
        connection_id: string;
    } | null>;
    delete(tournId: string, connectionId: string): Promise<void>;
}

export interface MatchListSink {
    listAll(tournId: string): Promise<unknown[]>;
}

export interface TournamentExistsSink {
    get(id: string): Promise<unknown | null>;
}

export interface BracketInitBroadcaster {
    sendInit(connectionId: string, tournId: string, matches: unknown[]): Promise<void>;
}

/* ------------------- ConnectToTournamentBracket ----------------------- */

export interface ConnectToTournamentBracketInput {
    tournId: string;
    userId: string;
    connectionId: string;
}

export class ConnectToTournamentBracketCommand extends Command<void> {
    constructor(public readonly input: ConnectToTournamentBracketInput) {
        super();
    }
}

export class ConnectToTournamentBracketHandler
    implements CommandHandler<ConnectToTournamentBracketCommand> {
    constructor(
        private readonly tournaments: TournamentExistsSink,
        private readonly conns: TournConnectionsSink,
        private readonly matches: MatchListSink,
        private readonly bracket: BracketInitBroadcaster,
    ) { }
    async execute(c: ConnectToTournamentBracketCommand): Promise<void> {
        const t = await this.tournaments.get(c.input.tournId);
        if (!t) throw new DomainError("tournament.not_found", 404);
        await this.conns.put(c.input.tournId, c.input.connectionId, c.input.userId);
        const all = await this.matches.listAll(c.input.tournId);
        await this.bracket.sendInit(
            c.input.connectionId,
            c.input.tournId,
            all,
        );
    }
}

/* ------------------- DisconnectFromTournamentBracket ------------------ */

export class DisconnectFromTournamentBracketCommand extends Command<void> {
    constructor(public readonly connectionId: string) {
        super();
    }
}

export class DisconnectFromTournamentBracketHandler
    implements CommandHandler<DisconnectFromTournamentBracketCommand> {
    constructor(private readonly conns: TournConnectionsSink) { }
    async execute(c: DisconnectFromTournamentBracketCommand): Promise<void> {
        const row = await this.conns.byConnectionId(c.connectionId);
        if (row) await this.conns.delete(row.tourn_id, c.connectionId);
    }
}

/* ------------------- TournHeartbeat ----------------------------------- */

export class TournHeartbeatCommand extends Command<void> {
    constructor(public readonly connectionId: string) {
        super();
    }
}

export class TournHeartbeatHandler
    implements CommandHandler<TournHeartbeatCommand> {
    constructor(private readonly conns: TournConnectionsSink) { }
    async execute(c: TournHeartbeatCommand): Promise<void> {
        const row = await this.conns.byConnectionId(c.connectionId);
        if (!row) throw new DomainError("connection.not_found", 404);
        await this.conns.put(row.tourn_id, c.connectionId, row.user_id);
    }
}
