export interface ConnectionRecord {
    connection_id: string;
    display_name: string;
    role?: "racer" | "spectator";
    cursor_lite?: boolean;
    /** Phase 16.7 — highest frame seq this connection has acked. */
    last_ack_seq?: number;
    /** Phase 16.7 — frames dropped in a row; resets on a successful send. */
    consecutive_drops?: number;
    PK: string;
    SK: string;
}

export interface ConnectionRepo {
    put(
        roomId: string,
        connectionId: string,
        displayName: string,
        role: "racer" | "spectator",
        opts: { cursor_lite?: boolean },
    ): Promise<void>;

    byConnectionId(connectionId: string): Promise<ConnectionRecord | null>;

    listByRoom(roomId: string): Promise<string[]>;

    /**
     * Phase 16.7 — list connections for a room with the per-connection
     * fields the broadcast dispatcher needs to apply drop-on-slow policy.
     */
    listRowsByRoom?(roomId: string): Promise<ConnectionRecord[]>;

    delete(pk: string, sk: string): Promise<void>;

    touch(roomId: string, connectionId: string): Promise<void>;

    consumeChatToken(roomId: string, connectionId: string): Promise<void>;

    /**
     * Phase 16.7 — record that a client has acked up through `seq`.
     * Implementations should `MAX(current, seq)` so out-of-order acks
     * never go backwards. Also resets `consecutive_drops` to 0.
     */
    recordAck?(connectionId: string, seq: number): Promise<void>;

    /**
     * Phase 16.7 — increment consecutive_drops by 1; returns the new value.
     */
    incrementConsecutiveDrops?(connectionId: string): Promise<number>;

    /**
     * Phase 16.7 — reset consecutive_drops to 0 after a successful send.
     */
    resetConsecutiveDrops?(connectionId: string): Promise<void>;
}
