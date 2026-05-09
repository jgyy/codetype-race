import { z } from "zod";
import { DdbRaceEventStore } from "@codetype/adapters-aws";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { ddb, TABLE } from "../src/ddb";

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });

const EmptyBody = z.object({}).passthrough();
const RaceIdSchema = z.string().uuid();
const REPLAY_LIMIT = 10_000;

interface ReplayResponse {
    raceId: string;
    source: "digest" | "raw";
    /** Lifecycle + non-cursor events, always full-fidelity. */
    events: RaceEvent[];
    /** Present when source='digest'. */
    digest?: RaceEvent | null;
    /** Present when source='raw'. */
    cursorEvents?: RaceEvent[];
}

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const raceId = (() => {
        try {
            return RaceIdSchema.parse(ctx.pathParameters.id ?? "");
        } catch {
            throw Errors.BadRequest("invalid race id");
        }
    })();
    const events = await eventStore.listEvents({
        raceId,
        sinceSeq: -1,
        limit: REPLAY_LIMIT,
    });
    if (events.length === 0) throw Errors.NotFound("race not found");

    const digest = events.find((e) => e.type === "CURSOR_DIGEST") ?? null;
    const lifecycle = events.filter(
        (e) => e.type !== "CURSOR_PROGRESS" && e.type !== "CURSOR_DIGEST",
    );
    if (digest) {
        const response: ReplayResponse = {
            raceId,
            source: "digest",
            events: lifecycle,
            digest,
        };
        return response;
    }
    const cursorEvents = events.filter((e) => e.type === "CURSOR_PROGRESS");
    const response: ReplayResponse = {
        raceId,
        source: "raw",
        events: lifecycle,
        cursorEvents,
    };
    return response;
});
