import {
    DomainError,
    type ConnectionRepo,
    type RoomRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export interface ConnectToRoomInput {
    connectionId: string;
    code: string;
    displayName: string;
    role: "racer" | "spectator";
    cursorLite: boolean;
}

export class ConnectToRoomCommand extends Command<void> {
    constructor(public readonly input: ConnectToRoomInput) {
        super();
    }
}

export class ConnectToRoomHandler implements CommandHandler<ConnectToRoomCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly connections: ConnectionRepo,
    ) { }

    async execute(c: ConnectToRoomCommand): Promise<void> {
        const room = await this.rooms.getByCode(c.input.code);
        if (!room) throw new DomainError("room.not_found", 404);
        await this.connections.put(
            room.room_id,
            c.input.connectionId,
            c.input.displayName,
            c.input.role,
            { cursor_lite: c.input.cursorLite },
        );
    }
}
