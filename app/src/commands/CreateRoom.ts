import {
    DomainError,
    JoinCode,
    Room,
    type Clock,
    type Random,
    type RoomMode,
    type RoomRepo,
    type SeedPlayer,
    type SnippetRepo,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../bus/Command";

export interface CreateRoomTeam {
    id: string;
    name: string;
    color: string;
    members: string[];
}

export interface CreateRoomInput {
    hostId: string;
    snippetId?: string;
    filters?: { language?: string; difficulty?: number };
    previousRoomId?: string;
    newSnippet?: boolean;
    mode?: RoomMode;
    /** Team-mode roster — only consulted when mode === "team". */
    teams?: CreateRoomTeam[];
}

export interface CreateRoomResult {
    room_id: string;
    code: string;
}

export class CreateRoomCommand extends Command<CreateRoomResult> {
    constructor(public readonly input: CreateRoomInput) {
        super();
    }
}

const MAX_CODE_TRIES = 5;

/**
 * Hook the team-room side-effect on top of the core command. The
 * team-rooms repo is intentionally NOT a domain port yet — it lives
 * outside the room aggregate and will move in slice 13.4 alongside the
 * other team handlers.
 */
export interface TeamRoomSink {
    putTeams(roomId: string, teams: CreateRoomTeam[]): Promise<void>;
}

export class CreateRoomHandler implements CommandHandler<CreateRoomCommand> {
    constructor(
        private readonly rooms: RoomRepo,
        private readonly snippets: SnippetRepo,
        private readonly clock: Clock,
        private readonly random: Random,
        /** Optional — only required when team mode is in use. */
        private readonly teamRooms?: TeamRoomSink,
    ) { }

    async execute(command: CreateRoomCommand): Promise<CreateRoomResult> {
        const input = command.input;
        const { snippetId, seedPlayers } = await this.resolveSetup(input);
        const code = await this.allocateUniqueCode();
        const room = Room.create({
            hostId: input.hostId,
            snippetId,
            joinCode: JoinCode.from(code),
            mode: input.mode,
            clock: this.clock,
            random: this.random,
        });
        await this.rooms.save(room, seedPlayers);
        if (input.mode === "team" && input.teams) {
            if (!this.teamRooms) {
                throw new DomainError(
                    "room.team_sink_missing",
                    500,
                    "team-mode requested but no TeamRoomSink wired",
                );
            }
            await this.teamRooms.putTeams(room.id.value, input.teams);
        }
        return { room_id: room.id.value, code: room.joinCode.value };
    }

    private async allocateUniqueCode(): Promise<string> {
        for (let i = 0; i < MAX_CODE_TRIES; i++) {
            const code = this.random.joinCode();
            if (!(await this.rooms.isCodeTaken(code))) return code;
        }
        throw new DomainError(
            "room.code_exhausted",
            500,
            "could not allocate unique room code",
        );
    }

    private async resolveSetup(
        input: CreateRoomInput,
    ): Promise<{ snippetId: string; seedPlayers: SeedPlayer[] }> {
        if (input.previousRoomId) {
            const prev = await this.rooms.getById(input.previousRoomId);
            if (!prev) throw new DomainError("snippet.not_found", 404, "previous room");

            let snippetId = prev.snippet_id;
            if (input.newSnippet) {
                const picked = await this.snippets.random(input.filters ?? {});
                if (!picked) throw new DomainError("snippet.not_found", 404);
                snippetId = picked.snippet_id;
            } else {
                const stillExists = await this.snippets.getById(snippetId);
                if (!stillExists) throw new DomainError("snippet.not_found", 404);
            }

            const prevPlayers = await this.rooms.listPlayers(input.previousRoomId);
            const joinedAt = this.clock.epochMs();
            const seedPlayers: SeedPlayer[] = prevPlayers
                .filter((p) => !(p as SeedPlayer & { is_dnf?: boolean }).is_dnf)
                .map((p) => ({
                    user_id: p.user_id,
                    display_name: p.display_name,
                    joined_at: joinedAt,
                    chars_typed: 0,
                    errors: 0,
                    progress: 0,
                }));
            return { snippetId, seedPlayers };
        }

        if (input.filters && !input.snippetId) {
            const picked = await this.snippets.random(input.filters);
            if (!picked) throw new DomainError("snippet.not_found", 404);
            return { snippetId: picked.snippet_id, seedPlayers: [] };
        }

        if (input.snippetId) {
            const snippet = await this.snippets.getById(input.snippetId);
            if (!snippet) throw new DomainError("snippet.not_found", 404);
            return { snippetId: input.snippetId, seedPlayers: [] };
        }

        throw new DomainError(
            "room.bad_request",
            400,
            "snippet_id, filters, or previous_room_id required",
        );
    }
}
