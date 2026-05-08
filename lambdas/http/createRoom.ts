import { v7 as uuidv7 } from "uuid";
import { generateRoomCode } from "@codetype/shared/ddb-keys";
import {
    CreateRoomRequestSchema,
    CreateRoomResponseSchema,
    type Player,
    type Room,
} from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";
import { snippets } from "../src/repos/SnippetRepo";
import { teamRooms } from "../src/repos/TeamRoomRepo";

const MAX_CODE_TRIES = 5;

async function uniqueCode(): Promise<string> {
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const code = generateRoomCode();
        if (!(await rooms.isCodeTaken(code))) return code;
    }
    throw Errors.Internal("could not allocate unique room code");
}

interface ResolvedSetup {
    snippet_id: string;
    seedPlayers: Player[];
}

async function resolveSetup(input: {
    snippet_id?: string;
    filters?: { language?: string; difficulty?: number };
    previous_room_id?: string;
    new_snippet?: boolean;
}): Promise<ResolvedSetup> {
    if (input.previous_room_id) {
        const prev = await rooms.getMeta(input.previous_room_id);
        if (!prev) throw Errors.NotFound("previous room");

        let snippet_id = prev.snippet_id;
        if (input.new_snippet) {
            const picked = await snippets.random(input.filters ?? {});
            if (!picked) throw Errors.NotFound("snippet");
            snippet_id = picked.snippet_id;
        } else {
            const stillExists = await snippets.getById(snippet_id);
            if (!stillExists) throw Errors.NotFound("snippet");
        }

        const prevPlayers = await rooms.listPlayers(input.previous_room_id);
        const seedPlayers: Player[] = prevPlayers
            .filter((p) => !p.is_dnf)
            .map((p) => ({
                display_name: p.display_name,
                user_id: p.user_id,
                joined_at: Date.now(),
                chars_typed: 0,
                errors: 0,
                progress: 0,
            }));
        return { snippet_id, seedPlayers };
    }

    if (input.filters && !input.snippet_id) {
        const picked = await snippets.random(input.filters);
        if (!picked) throw Errors.NotFound("snippet");
        return { snippet_id: picked.snippet_id, seedPlayers: [] };
    }

    if (input.snippet_id) {
        const snippet = await snippets.getById(input.snippet_id);
        if (!snippet) throw Errors.NotFound("snippet");
        return { snippet_id: input.snippet_id, seedPlayers: [] };
    }

    throw Errors.BadRequest("snippet_id, filters, or previous_room_id required");
}

export const handler = withHttp(
    CreateRoomRequestSchema,
    async (input, ctx) => {
        if (!ctx.userId) throw Errors.Unauthorized();

        const { snippet_id, seedPlayers } = await resolveSetup(input);

        const isTeam = input.mode === "team";
        const room: Room & { mode?: string } = {
            room_id: uuidv7(),
            code: await uniqueCode(),
            host_id: ctx.userId,
            snippet_id,
            status: "lobby",
            created_at: Date.now(),
            version: 0,
            ...(isTeam ? { mode: "team" } : {}),
        };
        await rooms.create(room, seedPlayers);
        if (isTeam && input.teams) {
            await teamRooms.putTeams(room.room_id, input.teams);
        }

        return CreateRoomResponseSchema.parse({
            room_id: room.room_id,
            code: room.code,
        });
    },
);
