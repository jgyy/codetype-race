import {
    DomainError,
    type RoomRepo,
    type RoomSnapshot,
} from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

export interface GetRoomResult {
    room_id: string;
    code: string;
    snippet_id: string;
    status: RoomSnapshot["status"];
    started_at?: number;
}

export class GetRoomQuery extends Query<GetRoomResult> {
    constructor(public readonly code: string) {
        super();
    }
}

export class GetRoomHandler implements QueryHandler<GetRoomQuery> {
    constructor(private readonly rooms: RoomRepo) { }

    async execute(query: GetRoomQuery): Promise<GetRoomResult> {
        const room = await this.rooms.getByCode(query.code);
        if (!room) throw new DomainError("room.not_found", 404);
        return {
            room_id: room.room_id,
            code: room.code,
            snippet_id: room.snippet_id,
            status: room.status,
            started_at: room.started_at,
        };
    }
}
