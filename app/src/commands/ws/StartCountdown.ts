import {
    DomainError,
    type Clock,
    type ConnectionRepo,
    type RoomRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";
const COUNTDOWN_MS = 3000;

export interface StartCountdownInput {
    connectionId: string;
}

export class StartCountdownCommand extends Command<void> {
    constructor(public readonly input: StartCountdownInput) {
        super();
    }
}

export class StartCountdownHandler
    implements CommandHandler<StartCountdownCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly connections: ConnectionRepo,
        private readonly clock: Clock,
    ) { }

    async execute(c: StartCountdownCommand): Promise<void> {
        const conn = await this.connections.byConnectionId(c.input.connectionId);
        if (!conn) throw new DomainError("connection.not_found", 404);
        const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
        const room = await this.rooms.getById(roomId);
        if (!room) throw new DomainError("room.not_found", 404);
        const startedAt = this.clock.epochMs() + COUNTDOWN_MS;
        await this.rooms.startCountdown(roomId, startedAt);
    }
}
