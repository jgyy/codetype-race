import { DomainError } from "../errors";
import { JoinCode } from "../valueObjects/JoinCode";
import { RoomId } from "../valueObjects/RoomId";
import type { Clock } from "../ports/Clock";
import type { Random } from "../ports/Random";

export type RoomStatus = "lobby" | "countdown" | "racing" | "finished";

export type RoomMode = "solo" | "team";

export interface RoomSnapshot {
    room_id: string;
    code: string;
    host_id: string;
    snippet_id: string;
    status: RoomStatus;
    created_at: number;
    version: number;
    mode?: RoomMode;
    started_at?: number;
}

export interface SeedPlayer {
    user_id?: string;
    display_name: string;
    joined_at: number;
    chars_typed: number;
    errors: number;
    progress: number;
}

export interface CreateRoomArgs {
    hostId: string;
    snippetId: string;
    joinCode: JoinCode;
    mode?: RoomMode;
    clock: Clock;
    random: Random;
}

export class Room {
    private constructor(private state: RoomSnapshot) { }

    static create(args: CreateRoomArgs): Room {
        const id = RoomId.from(args.random.uuid());
        return new Room({
            room_id: id.value,
            code: args.joinCode.value,
            host_id: args.hostId,
            snippet_id: args.snippetId,
            status: "lobby",
            created_at: args.clock.epochMs(),
            version: 0,
            ...(args.mode === "team" ? { mode: "team" as const } : {}),
        });
    }

    static fromSnapshot(s: RoomSnapshot): Room {
        return new Room({ ...s });
    }

    toSnapshot(): RoomSnapshot {
        return { ...this.state };
    }

    get id(): RoomId {
        return RoomId.from(this.state.room_id);
    }

    get joinCode(): JoinCode {
        return JoinCode.from(this.state.code);
    }

    get status(): RoomStatus {
        return this.state.status;
    }

    get hostId(): string {
        return this.state.host_id;
    }

    get snippetId(): string {
        return this.state.snippet_id;
    }

    get mode(): RoomMode {
        return this.state.mode ?? "solo";
    }

    startCountdown(by: string, clock: Clock): void {
        if (by !== this.state.host_id) {
            throw new DomainError("room.not_host", 403);
        }
        if (this.state.status !== "lobby") {
            throw new DomainError("room.not_lobby", 409);
        }
        this.state = {
            ...this.state,
            status: "countdown",
            started_at: clock.epochMs(),
            version: this.state.version + 1,
        };
    }
}
