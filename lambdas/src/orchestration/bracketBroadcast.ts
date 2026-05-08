import type {
    BracketWsServerMessage,
    TournamentMatch,
} from "@codetype/shared/tournaments";
import { postTo } from "../wsClient";
import type { TournConnectionRepo } from "../repos/TournConnectionRepo";

/**
 * Send a BRACKET_INIT-style payload to a single connection (used on $connect).
 */
export async function sendInitToConn(
    connectionId: string,
    tournId: string,
    matches: TournamentMatch[],
): Promise<void> {
    const msg: BracketWsServerMessage = {
        type: "BRACKET_INIT",
        tournId,
        matches,
    };
    await postTo(connectionId, msg).catch(() => false);
}

/** Fan a BRACKET_UPDATE out to every viewer of a tournament. */
export async function broadcastBracketUpdate(args: {
    repo: TournConnectionRepo;
    tournId: string;
    match: TournamentMatch;
}): Promise<number> {
    const conns = await args.repo.listByTournament(args.tournId);
    const msg: BracketWsServerMessage = {
        type: "BRACKET_UPDATE",
        tournId: args.tournId,
        match: args.match,
    };
    const results = await Promise.all(
        conns.map((id) => postTo(id, msg).catch(() => false)),
    );
    return results.filter(Boolean).length;
}

/** Public match-done announcement after a child match completes. */
export async function broadcastMatchDone(args: {
    repo: TournConnectionRepo;
    tournId: string;
    round: number;
    slot: number;
    winnerId: string;
}): Promise<void> {
    const conns = await args.repo.listByTournament(args.tournId);
    const msg: BracketWsServerMessage = {
        type: "MATCH_DONE",
        tournId: args.tournId,
        round: args.round,
        slot: args.slot,
        winnerId: args.winnerId,
    };
    await Promise.all(conns.map((id) => postTo(id, msg).catch(() => false)));
}

/**
 * Private MATCH_READY for the two players of a freshly-scheduled parent
 * match. Both players' currently-connected viewer connections receive it.
 */
export async function broadcastMatchReady(args: {
    repo: TournConnectionRepo;
    tournId: string;
    round: number;
    slot: number;
    roomId: string;
    opensInMs: number;
    playerIds: Array<string | null>;
}): Promise<void> {
    const msg: BracketWsServerMessage = {
        type: "MATCH_READY",
        tournId: args.tournId,
        round: args.round,
        slot: args.slot,
        roomId: args.roomId,
        opensInMs: args.opensInMs,
    };
    const targets = await Promise.all(
        args.playerIds
            .filter((id): id is string => !!id)
            .map((id) => args.repo.listByUserInTournament(args.tournId, id)),
    );
    const flat = targets.flat();
    await Promise.all(flat.map((c) => postTo(c, msg).catch(() => false)));
}

export async function broadcastTournamentFinished(args: {
    repo: TournConnectionRepo;
    tournId: string;
    winnerId: string;
}): Promise<void> {
    const conns = await args.repo.listByTournament(args.tournId);
    const msg: BracketWsServerMessage = {
        type: "TOURNAMENT_FINISHED",
        tournId: args.tournId,
        winnerId: args.winnerId,
    };
    await Promise.all(conns.map((id) => postTo(id, msg).catch(() => false)));
}
