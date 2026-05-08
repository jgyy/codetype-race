/**
 * Phase-13 slice 13.4a surface for the WS connection table.
 *
 * Keeps only the methods the room-WS handler cluster (start, finish-
 * adjacent, chat, heartbeat, connect, disconnect) needs. Cursor and
 * presence access patterns stay on the legacy ConnectionRepo until
 * their own slices.
 */

export interface ConnectionRecord {
    /** API Gateway WS connectionId. */
    connection_id: string;
    /** Player display name within the room. */
    display_name: string;
    /** Race role; defaults to "racer" when absent on legacy rows. */
    role?: "racer" | "spectator";
    /** Phase 12 reduced cursor stream opt-in. */
    cursor_lite?: boolean;
    /** ROOM#<roomId> partition key. */
    PK: string;
    /** CONN#<connectionId> sort key. */
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

    /** Connection IDs of every member of a room. */
    listByRoom(roomId: string): Promise<string[]>;

    /** Hard-delete by composite key (caller already has the row). */
    delete(pk: string, sk: string): Promise<void>;

    /** Refresh TTL on an existing row. */
    touch(roomId: string, connectionId: string): Promise<void>;

    /**
     * Decrement chat budget; throws when the connection is over its
     * window allowance. Implementation is moving from the legacy repo
     * unchanged.
     */
    consumeChatToken(roomId: string, connectionId: string): Promise<void>;
}
