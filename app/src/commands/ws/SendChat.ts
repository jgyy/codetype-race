import {
    DomainError,
    type Broadcaster,
    type Clock,
    type ConnectionRepo,
    type RoomRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";

export interface SendChatInput {
    connectionId: string;
    text: string;
}

export class SendChatCommand extends Command<void> {
    constructor(public readonly input: SendChatInput) {
        super();
    }
}

export class SendChatHandler implements CommandHandler<SendChatCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly connections: ConnectionRepo,
        private readonly broadcaster: Broadcaster,
        private readonly clock: Clock,
    ) { }

    async execute(c: SendChatCommand): Promise<void> {
        const conn = await this.connections.byConnectionId(c.input.connectionId);
        if (!conn) throw new DomainError("connection.not_found", 404);
        const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
        const room = await this.rooms.getById(roomId);
        if (!room) throw new DomainError("room.not_found", 404);
        if (room.status !== "lobby" && room.status !== "finished") {
            throw new DomainError("chat.closed", 409);
        }
        await this.connections.consumeChatToken(roomId, c.input.connectionId);
        const payload = {
            type: "chat" as const,
            display_name: conn.display_name,
            text: c.input.text,
            ts: this.clock.epochMs(),
        };
        const peers = await this.connections.listByRoom(roomId);
        await Promise.all(peers.map((id) => this.broadcaster.postTo(id, payload)));
    }
}
