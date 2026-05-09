/**
 * IdempotencyStore — caches the result of a command keyed by (userId, commandId).
 *
 * The first writer puts a row inside the same transaction as the events it
 * appends. A retry sees the existing row and returns its cached result,
 * letting the caller short-circuit without re-running the handler.
 *
 * Implementations TTL old rows (e.g. 1h) so the table doesn't grow unbounded.
 */
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
    /**
     * Atomically inserts the record, failing with `ConditionalCheckFailed`-shaped
     * error if one already exists. Adapters wrap the error so callers can detect
     * a race and read back the existing record.
     */
    put(record: IdempotencyRecord): Promise<void>;
}

export class IdempotencyConflictError extends Error {
    constructor(public readonly existing: IdempotencyRecord) {
        super(`idempotency conflict for ${existing.userId}/${existing.commandId}`);
        this.name = "IdempotencyConflictError";
    }
}
