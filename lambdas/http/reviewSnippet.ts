import { z } from "zod";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors, requireAdmin } from "../src/AppError";
import { commandBus, ReviewSnippetCommand } from "./_container";

const Body = z
    .object({ reason: z.string().max(280).optional() })
    .passthrough();

export const handler = withHttp(Body, async (input, ctx) => {
    requireAdmin(ctx);
    const id = ctx.pathParameters.snippetId;
    if (!id) throw Errors.BadRequest("snippet_id required");

    const route = ctx.route;
    let decision: "approved" | "rejected";
    if (route.endsWith("/approve")) decision = "approved";
    else if (route.endsWith("/reject")) decision = "rejected";
    else throw Errors.BadRequest("invalid review action");

    try {
        return await commandBus.dispatch(
            new ReviewSnippetCommand({
                snippetId: id,
                reviewerId: ctx.userId!,
                decision,
                reason: input.reason,
            }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
