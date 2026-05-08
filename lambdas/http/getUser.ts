import { z } from "zod";
import { GetUserResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { GetUserQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const param = ctx.pathParameters.userId;
    let target: string;
    if (param === undefined || param === "me") {
        if (!ctx.userId) throw Errors.Unauthorized();
        target = ctx.userId;
    } else {
        target = param;
    }
    const c = ctx.claims;
    const displayNameFallback =
        (c["preferred_username"] as string | undefined) ||
        (c["cognito:username"] as string | undefined) ||
        (c["name"] as string | undefined) ||
        ((c["email"] as string | undefined)?.split("@")[0]) ||
        target.slice(0, 8);
    try {
        const result = await queryBus.execute(
            new GetUserQuery({
                targetUserId: target,
                viewerUserId: ctx.userId,
                displayNameFallback,
                viewerGroups: ctx.groups,
            }),
        );
        return GetUserResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
