import {
    DomainError,
    type Clock,
    type RoomRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../bus/Command";

const MAX_RACERS = 8;

export interface JoinRoomInput {
    code: string;
    displayName: string;
    role: "racer" | "spectator";
}

export interface JoinRoomResult {
    room_id: string;
    snippet_id: string;
    status: string;
}

export class JoinRoomCommand extends Command<JoinRoomResult> {
    constructor(public readonly input: JoinRoomInput) {
        super();
    }
}

export class JoinRoomHandler implements CommandHandler<JoinRoomCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly clock: Clock,
    ) { }

    async execute(c: JoinRoomCommand): Promise<JoinRoomResult> {
        const room = await this.rooms.getByCode(c.input.code);
        if (!room) throw new DomainError("room.not_found", 404);
        if (room.status !== "lobby") {
            throw new DomainError("room.not_joinable", 409);
        }
        if (c.input.role === "racer") {
            const existing = (await this.rooms.listPlayers(room.room_id)) as Array<{
                role?: "racer" | "spectator";
            }>;
            const racerCount = existing.filter(
                (p) => (p.role ?? "racer") === "racer",
            ).length;
            if (racerCount >= MAX_RACERS) {
                throw new DomainError("room.full", 409);
            }
        }
        await this.rooms.addPlayer(room.room_id, {
            display_name: c.input.displayName,
            joined_at: this.clock.epochMs(),
            chars_typed: 0,
            errors: 0,
            progress: 0,
            role: c.input.role,
        });
        return {
            room_id: room.room_id,
            snippet_id: room.snippet_id,
            status: room.status,
        };
    }
}
