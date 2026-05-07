import { z } from "zod";
import { withHttp } from "../src/middleware";
import { Errors, requireAdmin } from "../src/AppError";
import { snippets } from "../src/repos/SnippetRepo";

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

    await snippets.approveOrReject(id, ctx.userId!, decision, input.reason);
    return { snippet_id: id, status: decision };
});
