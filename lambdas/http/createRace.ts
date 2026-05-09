import { v4 as uuidv4 } from "uuid";
import {
    DdbIdempotencyStore,
    DdbRaceEventStore,
    SystemClock,
} from "@codetype/adapters-aws";
import { RaceCommandBus } from "@codetype/domain/RaceCommandBus";

import { ddb, TABLE } from "../src/ddb";
import {
    CreateRaceRequestSchema,
    withRaceCommand,
} from "../src/raceCommand";

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });
const idempotencyStore = new DdbIdempotencyStore({ table: TABLE, client: ddb });
const bus = new RaceCommandBus({ eventStore, idempotencyStore });
const clock = new SystemClock();

export const handler = withRaceCommand({
    inputSchema: CreateRaceRequestSchema,
    bus,
    clock,
    newOutboxId: () => uuidv4(),
    raceId: (input) => input.raceId,
    build: async (input, ctx) => ({
        events: [
            {
                type: "RACE_CREATED",
                actorId: ctx.userId,
                payload: { snippetId: input.snippetId },
            },
            {
                type: "PLAYER_JOINED",
                actorId: ctx.userId,
                payload: {
                    userId: ctx.userId,
                    displayName: input.displayName,
                },
            },
        ],
        result: {
            raceId: input.raceId,
            status: "lobby" as const,
            host: { userId: ctx.userId, displayName: input.displayName },
        },
        httpStatus: 201,
    }),
});
