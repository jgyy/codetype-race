export interface ConnectionRecord {
    connection_id: string;
    display_name: string;
    role?: "racer" | "spectator";
    cursor_lite?: boolean;
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

    delete(pk: string, sk: string): Promise<void>;

    touch(roomId: string, connectionId: string): Promise<void>;

    consumeChatToken(roomId: string, connectionId: string): Promise<void>;
}
