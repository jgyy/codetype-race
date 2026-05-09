import type { RaceState } from "../services/RaceReducer";

export interface RaceProjectionStore {
    get(raceId: string): Promise<RaceState | null>;
    put(args: {
        raceId: string;
        state: RaceState;
        expectedLastSeq: number | null;
    }): Promise<void>;
}

export class ProjectionConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectionConflictError";
    }
}
