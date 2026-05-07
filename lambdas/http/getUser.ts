import { z } from "zod";
import { GetUserResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { users } from "../src/repos/UserRepo";

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

    let profile = await users.getProfile(target);
    if (!profile) {
        if (target !== ctx.userId) throw Errors.NotFound("user");
        const c = ctx.claims;
        const displayName =
            (c["preferred_username"] as string | undefined) ||
            (c["cognito:username"] as string | undefined) ||
            (c["name"] as string | undefined) ||
            ((c["email"] as string | undefined)?.split("@")[0]) ||
            target.slice(0, 8);
        profile = await users.getOrCreate(target, displayName);
    }

    const recent = await users.listRecentRaces(target, 20);
    // Only surface group claims when the caller is asking about themselves.
    const groups = target === ctx.userId ? ctx.groups : undefined;
    return GetUserResponseSchema.parse({ profile, recent, groups });
});
