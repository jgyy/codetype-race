import { DomainError, type RoomRepo } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export interface ReserveReplayUploadInput {
    roomId: string;
}

export interface ReserveReplayUploadResult {
    key: string;
}

export class ReserveReplayUploadCommand extends Command<ReserveReplayUploadResult> {
    constructor(public readonly input: ReserveReplayUploadInput) {
        super();
    }
}

function replayKey(roomId: string): string {
    return `replays/${roomId}.json`;
}

export class ReserveReplayUploadHandler
    implements CommandHandler<ReserveReplayUploadCommand> {
    constructor(private readonly rooms: RoomRepo) { }
    async execute(c: ReserveReplayUploadCommand): Promise<ReserveReplayUploadResult> {
        const room = await this.rooms.getById(c.input.roomId);
        if (!room) throw new DomainError("room.not_found", 404);
        const key = replayKey(c.input.roomId);
        await this.rooms.recordReplay(c.input.roomId, key);
        return { key };
    }
}
