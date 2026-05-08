/**
 * Outbound WebSocket broadcaster — abstracts the API Gateway
 * Management API so domain/app code can broadcast without knowing
 * about AWS or HTTP transport.
 *
 * The implementation must be tolerant of dead connections (stale
 * connectionIds) — it never throws for a single failed peer; it
 * returns false instead so the caller can decide whether to evict.
 */
export interface Broadcaster {
    /**
     * Send a JSON-serializable payload to a single connection.
     * Returns false on any per-connection error (e.g. 410 Gone), true
     * on success. Never throws for transport-level failures.
     */
    postTo(connectionId: string, payload: unknown): Promise<boolean>;
}
