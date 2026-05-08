import { DomainError, type RoomRepo } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

/* ------------------- GetReplayKey -------------------------------------- */

export interface GetReplayKeyResult {
    key: string;
}

export class GetReplayKeyQuery extends Query<GetReplayKeyResult> {
    constructor(public readonly roomId: string) {
        super();
    }
}

export class GetReplayKeyHandler implements QueryHandler<GetReplayKeyQuery> {
    constructor(private readonly rooms: RoomRepo) { }
    async execute(q: GetReplayKeyQuery): Promise<GetReplayKeyResult> {
        const room = await this.rooms.getById(q.roomId);
        if (!room) throw new DomainError("room.not_found", 404);
        if (!room.replay_key) throw new DomainError("replay.not_found", 404);
        return { key: room.replay_key };
    }
}
