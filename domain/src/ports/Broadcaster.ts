export interface Broadcaster {
    postTo(connectionId: string, payload: unknown): Promise<boolean>;
    /**
     * Phase 16.7 — terminate a hard-stuck connection. Used by the
     * drop-on-slow dispatcher after `DROP_DISCONNECT_THRESHOLD`
     * consecutive drops; the client is expected to reconnect and
     * replay via Phase 14's HTTP-based seq catch-up.
     */
    disconnect?(connectionId: string): Promise<void>;
}
