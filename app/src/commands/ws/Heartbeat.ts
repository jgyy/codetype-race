import {
    DomainError,
    type ConnectionRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";

export interface HeartbeatInput {
    connectionId: string;
}

export class HeartbeatCommand extends Command<void> {
    constructor(public readonly input: HeartbeatInput) {
        super();
    }
}

export class HeartbeatHandler implements CommandHandler<HeartbeatCommand> {
    constructor(private readonly connections: ConnectionRepo) { }

    async execute(c: HeartbeatCommand): Promise<void> {
        const conn = await this.connections.byConnectionId(c.input.connectionId);
        if (!conn) throw new DomainError("connection.not_found", 404);
        const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
        await this.connections.touch(roomId, c.input.connectionId);
    }
}
