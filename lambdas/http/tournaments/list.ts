import { z } from "zod";
import {
    ListTournamentsResponseSchema,
    TournamentStatusSchema,
} from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import { tournaments } from "../../src/repos/TournamentRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const status =
        TournamentStatusSchema.parse(
            ctx.queryStringParameters.status ?? "registering",
        );
    const list = await tournaments.listByStatus(status);
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return ListTournamentsResponseSchema.parse({ tournaments: list });
});
