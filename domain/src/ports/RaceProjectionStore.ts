import type { RaceState } from "../services/RaceReducer";

export interface RaceProjectionStore {
    get(raceId: string): Promise<RaceState | null>;
    /**
     * Conditional write: succeeds only if the stored row's `lastSeq` equals
     * `expectedLastSeq`, or if the row does not exist when `expectedLastSeq`
     * is null. Throws ProjectionConflictError on mismatch.
     */
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
