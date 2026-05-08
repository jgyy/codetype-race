import { z } from "zod";
import { ListFriendsResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireFriendsEnabled } from "../../src/AppError";
import { friends } from "../../src/repos/FriendsRepo";
import { users } from "../../src/repos/UserRepo";
import { presence } from "../../src/repos/PresenceRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const edges = await friends.listFriends(ctx.userId);
    const accepted = edges.filter((e) => e.status === "accepted");
    if (accepted.length === 0) {
        return ListFriendsResponseSchema.parse({ friends: [] });
    }
    const otherIds = accepted.map((e) =>
        e.fromUserId === ctx.userId ? e.toUserId : e.fromUserId,
    );
    const profiles = await Promise.all(otherIds.map((id) => users.getProfile(id)));
    const onlineSet =
        process.env.ENABLE_PRESENCE === "true"
            ? await presence.whichOnline(otherIds)
            : new Set<string>();

    const list = accepted.map((edge, i) => {
        const other = otherIds[i]!;
        const profile = profiles[i];
        return {
            user_id: other,
            display_name: profile?.display_name ?? other.slice(0, 8),
            rating: profile?.rating ?? 0,
            presence: onlineSet.has(other) ? ("online" as const) : ("offline" as const),
            accepted_at: edge.acceptedAt,
        };
    });
    list.sort((a, b) => {
        if (a.presence !== b.presence) return a.presence === "online" ? -1 : 1;
        return a.display_name.localeCompare(b.display_name);
    });
    return ListFriendsResponseSchema.parse({ friends: list });
});
