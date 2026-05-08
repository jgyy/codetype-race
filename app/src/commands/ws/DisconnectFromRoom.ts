import type { ConnectionRepo, RoomRepo } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";

export interface DisconnectFromRoomInput {
    connectionId: string;
}

export interface DisconnectFromRoomResult {
    applied: boolean;
}

export class DisconnectFromRoomCommand extends Command<DisconnectFromRoomResult> {
    constructor(public readonly input: DisconnectFromRoomInput) {
        super();
    }
}

export class DisconnectFromRoomHandler
    implements CommandHandler<DisconnectFromRoomCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly connections: ConnectionRepo,
    ) { }

    async execute(
        c: DisconnectFromRoomCommand,
    ): Promise<DisconnectFromRoomResult> {
        const conn = await this.connections.byConnectionId(c.input.connectionId);
        if (!conn) return { applied: false };
        await this.connections.delete(conn.PK, conn.SK);
        const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
        await this.rooms.markPlayerDnf(roomId, conn.display_name);
        return { applied: true };
    }
}
