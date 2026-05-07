import { z } from "zod";
import { GetUserResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { users } from "../src/repos/UserRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  // The same Lambda handles `/users/me` (auth-required) and
  // `/users/{userId}` (public). We disambiguate via path params:
  // `userId === "me"` means use the JWT's sub.
  const param = ctx.pathParameters.userId;
  let target: string;
  if (param === undefined || param === "me") {
    if (!ctx.userId) throw Errors.Unauthorized();
    target = ctx.userId;
  } else {
    target = param;
  }

  const profile = await users.getProfile(target);
  if (!profile) throw Errors.NotFound("user");

  const recent = await users.listRecentRaces(target, 20);
  return GetUserResponseSchema.parse({ profile, recent });
});
