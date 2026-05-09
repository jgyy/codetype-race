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
