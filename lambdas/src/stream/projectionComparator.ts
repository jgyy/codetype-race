import {
    DdbRaceProjectionStore,
    DdbRoomRepo,
} from "@codetype/adapters-aws";
import {
    compareProjectionToSnapshot,
    type DivergenceReport,
} from "@codetype/domain/ProjectionComparator";
import type {
    RaceProjectionStore,
    RoomRepo,
} from "@codetype/domain/ports";

import { ddb, TABLE } from "../ddb";

export interface CompareDeps {
    projectionStore: RaceProjectionStore;
    roomRepo: RoomRepo;
}

/**
 * Compare one (raceId, roomId) pair. Reads both stores in parallel and
 * delegates to the pure comparator. The Lambda harness emits the report as
 * structured JSON so a CloudWatch metric filter can fire an alarm on
 * `divergent=true`.
 */
export async function compareRace(
    raceId: string,
    roomId: string,
    deps: CompareDeps,
): Promise<DivergenceReport> {
    const [projection, snapshot, legacyPlayers] = await Promise.all([
        deps.projectionStore.get(raceId),
        deps.roomRepo.getById(roomId),
        deps.roomRepo.listPlayers(roomId),
    ]);
    return compareProjectionToSnapshot({
        raceId,
        projection,
        snapshot,
        legacyPlayers,
    });
}

const projectionStore = new DdbRaceProjectionStore({ table: TABLE, client: ddb });
const roomRepo = new DdbRoomRepo({ table: TABLE, client: ddb });

export interface ComparatorEvent {
    races: { raceId: string; roomId: string }[];
}

/**
 * EventBridge-scheduled Lambda. The schedule rule (defined in CDK in slice 15)
 * is responsible for picking which (raceId, roomId) pairs to inspect — typically
 * the active set since the last invocation. This handler just iterates and
 * compares; the divergence-rate metric drives the Phase B -> C cutover gate.
 */
export const handler = async (event: ComparatorEvent): Promise<{
    compared: number;
    divergent: number;
    oneSidedMissing: number;
}> => {
    const races = event.races ?? [];
    let divergent = 0;
    let oneSidedMissing = 0;
    for (const { raceId, roomId } of races) {
        const report = await compareRace(raceId, roomId, {
            projectionStore,
            roomRepo,
        });
        if (report.oneSidedMissing !== "none") oneSidedMissing++;
        if (report.divergent) divergent++;
        // Structured single-line log — CloudWatch metric filter keys on
        // "comparator.divergence" + divergent=true.
        console.log(
            JSON.stringify({
                tag: "comparator.divergence",
                raceId,
                roomId,
                divergent: report.divergent,
                oneSidedMissing: report.oneSidedMissing,
                fieldCount: report.fields.length,
                fields: report.fields,
            }),
        );
    }
    return { compared: races.length, divergent, oneSidedMissing };
};
