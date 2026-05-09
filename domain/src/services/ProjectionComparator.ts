import type { RaceState } from "./RaceReducer";
import type { RoomSnapshot, SeedPlayer } from "../entities/Room";

export interface FieldDivergence {
    path: string;
    projection: unknown;
    snapshot: unknown;
}

export interface DivergenceReport {
    raceId: string;
    divergent: boolean;
    fields: FieldDivergence[];
    oneSidedMissing: "none" | "projection" | "snapshot";
}

const LEGACY_TO_PROJECTION_STATUS: Record<string, RaceState["status"]> = {
    lobby: "lobby",
    countdown: "countdown",
    running: "racing",
    finished: "finished",
};

interface ComparablePlayer {
    displayName: string;
    charsTyped: number;
    errors: number;
    finished: boolean;
}

function projectionPlayers(state: RaceState): ComparablePlayer[] {
    return Object.values(state.players).map((p) => ({
        displayName: p.displayName,
        charsTyped: p.charsTyped,
        errors: p.errors,
        finished: p.finishedAt !== null,
    }));
}

function snapshotPlayers(players: SeedPlayer[]): ComparablePlayer[] {
    return players.map((p) => ({
        displayName: p.display_name,
        charsTyped: p.chars_typed,
        errors: p.errors,
        finished: p.progress >= 1,
    }));
}

function compareStatus(
    projection: RaceState["status"],
    snapshotStatus: string,
): FieldDivergence | null {
    const mapped = LEGACY_TO_PROJECTION_STATUS[snapshotStatus];
    if (mapped === undefined) {
        return {
            path: "status",
            projection,
            snapshot: snapshotStatus,
        };
    }
    if (mapped !== projection) {
        return {
            path: "status",
            projection,
            snapshot: snapshotStatus,
        };
    }
    return null;
}

function comparePlayers(
    projection: ComparablePlayer[],
    snapshot: ComparablePlayer[],
): FieldDivergence[] {
    const out: FieldDivergence[] = [];
    const byNameSnap = new Map(snapshot.map((p) => [p.displayName, p]));
    const byNameProj = new Map(projection.map((p) => [p.displayName, p]));

    const allNames = new Set([
        ...byNameSnap.keys(),
        ...byNameProj.keys(),
    ]);

    for (const name of allNames) {
        const p = byNameProj.get(name);
        const s = byNameSnap.get(name);
        if (!p) {
            out.push({
                path: `players[${name}]`,
                projection: null,
                snapshot: s,
            });
            continue;
        }
        if (!s) {
            out.push({
                path: `players[${name}]`,
                projection: p,
                snapshot: null,
            });
            continue;
        }
        if (p.charsTyped !== s.charsTyped) {
            out.push({
                path: `players[${name}].charsTyped`,
                projection: p.charsTyped,
                snapshot: s.charsTyped,
            });
        }
        if (p.errors !== s.errors) {
            out.push({
                path: `players[${name}].errors`,
                projection: p.errors,
                snapshot: s.errors,
            });
        }
        if (p.finished !== s.finished) {
            out.push({
                path: `players[${name}].finished`,
                projection: p.finished,
                snapshot: s.finished,
            });
        }
    }
    return out;
}

export function compareProjectionToSnapshot(args: {
    raceId: string;
    projection: RaceState | null;
    snapshot: RoomSnapshot | null;
    legacyPlayers: SeedPlayer[];
}): DivergenceReport {
    if (!args.projection && !args.snapshot) {
        return {
            raceId: args.raceId,
            divergent: false,
            fields: [],
            oneSidedMissing: "none",
        };
    }
    if (!args.projection) {
        return {
            raceId: args.raceId,
            divergent: true,
            fields: [],
            oneSidedMissing: "projection",
        };
    }
    if (!args.snapshot) {
        return {
            raceId: args.raceId,
            divergent: true,
            fields: [],
            oneSidedMissing: "snapshot",
        };
    }

    const fields: FieldDivergence[] = [];
    const statusDiff = compareStatus(args.projection.status, args.snapshot.status);
    if (statusDiff) fields.push(statusDiff);

    fields.push(
        ...comparePlayers(
            projectionPlayers(args.projection),
            snapshotPlayers(args.legacyPlayers),
        ),
    );

    return {
        raceId: args.raceId,
        divergent: fields.length > 0,
        fields,
        oneSidedMissing: "none",
    };
}
