import { z } from "zod";
import { DdbRaceEventStore } from "@codetype/adapters-aws";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { ddb, TABLE } from "../src/ddb";

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });

const EmptyBody = z.object({}).passthrough();
const RaceIdSchema = z.string().uuid();

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

function parseSinceSeq(raw: string | undefined): number {
    if (raw === undefined || raw === "") return -1;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < -1) {
        throw Errors.BadRequest("since must be a non-negative integer");
    }
    return n;
}

function parseLimit(raw: string | undefined): number {
    if (raw === undefined || raw === "") return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw Errors.BadRequest("limit must be a positive integer");
    }
    return Math.min(n, MAX_LIMIT);
}

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const raceId = (() => {
        try {
            return RaceIdSchema.parse(ctx.pathParameters.id ?? "");
        } catch {
            throw Errors.BadRequest("invalid race id");
        }
    })();
    const sinceSeq = parseSinceSeq(ctx.queryStringParameters.since);
    const limit = parseLimit(ctx.queryStringParameters.limit);

    const events = await eventStore.listEvents({ raceId, sinceSeq, limit });
    const nextCursor =
        events.length === limit ? events[events.length - 1].seq : null;

    return {
        events,
        nextCursor,
        hasMore: nextCursor !== null,
    };
});
