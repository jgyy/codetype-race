export interface IdempotencyRecord {
    userId: string;
    commandId: string;
    httpStatus: number;
    body: unknown;
    storedAt: string;
    ttl: number;
}

export interface IdempotencyStore {
    get(userId: string, commandId: string): Promise<IdempotencyRecord | null>;
    put(record: IdempotencyRecord): Promise<void>;
}

export class IdempotencyConflictError extends Error {
    constructor(public readonly existing: IdempotencyRecord) {
        super(`idempotency conflict for ${existing.userId}/${existing.commandId}`);
        this.name = "IdempotencyConflictError";
    }
}
