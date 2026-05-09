import { z } from "zod";
import { DdbRaceProjectionStore } from "@codetype/adapters-aws";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { ddb, TABLE } from "../src/ddb";

const projectionStore = new DdbRaceProjectionStore({ table: TABLE, client: ddb });

const EmptyBody = z.object({}).passthrough();
const RaceIdSchema = z.string().uuid();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const raceId = (() => {
        try {
            return RaceIdSchema.parse(ctx.pathParameters.id ?? "");
        } catch {
            throw Errors.BadRequest("invalid race id");
        }
    })();
    const state = await projectionStore.get(raceId);
    if (!state) throw Errors.NotFound("race not found");
    return state;
});
