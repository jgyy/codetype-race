import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";
import type { GuildReadsSink } from "./Guilds";
import type { UserReadsSink } from "./Users";

export interface FeedEvent {
    type: string;
    payload: Record<string, unknown>;
    [k: string]: unknown;
}

export interface FriendEdgeRow {
    fromUserId: string;
    toUserId: string;
    status: "pending" | "accepted" | "blocked";
    acceptedAt?: string;
    createdAt: string;
}

export interface FriendsReadsSink {
    getEdge(a: string, b: string): Promise<{ status: string } | null>;
    listFriends(userId: string): Promise<FriendEdgeRow[]>;
    listIncomingRequests(userId: string): Promise<Array<{ fromUserId: string; createdAt: string }>>;
}

export interface FeedReadsSink {
    list(userId: string): Promise<FeedEvent[]>;
}

export interface PresenceSink {
    whichOnline(userIds: string[]): Promise<Set<string>>;
}

/* ------------------- GetFeed ----------------------------------------- */

export interface GetFeedInput {
    targetUserId: string;
    viewerUserId?: string;
}

export class GetFeedQuery extends Query<{ events: FeedEvent[] }> {
    constructor(public readonly input: GetFeedInput) {
        super();
    }
}

export class GetFeedHandler implements QueryHandler<GetFeedQuery> {
    constructor(
        private readonly feed: FeedReadsSink,
        private readonly friends: FriendsReadsSink,
        private readonly guilds: GuildReadsSink,
    ) { }

    async execute(q: GetFeedQuery): Promise<{ events: FeedEvent[] }> {
        const { targetUserId, viewerUserId } = q.input;
        if (viewerUserId && viewerUserId !== targetUserId) {
            const edge = await this.friends.getEdge(viewerUserId, targetUserId);
            if (edge?.status === "blocked") {
                throw new DomainError("user.not_found", 404);
            }
        }
        const events = await this.feed.list(targetUserId);

        // Memoised guild visibility lookups — feed full of guild events
        // can't fan out into one Get per row.
        const guildCache = new Map<string, { visibility: "public" | "private" } | null>();
        const memberCache = new Map<string, boolean>();

        const isVisibleGuild = async (guildId: string): Promise<boolean> => {
            let g = guildCache.get(guildId);
            if (g === undefined) {
                const fetched = await this.guilds.get(guildId);
                g = fetched ? { visibility: fetched.visibility } : null;
                guildCache.set(guildId, g);
            }
            if (!g) return false;
            if (g.visibility === "public") return true;
            if (!viewerUserId) return false;
            const cacheKey = `${viewerUserId}:${guildId}`;
            let isMember = memberCache.get(cacheKey);
            if (isMember === undefined) {
                isMember = !!(await this.guilds.getMember(guildId, viewerUserId));
                memberCache.set(cacheKey, isMember);
            }
            return isMember;
        };

        const out: FeedEvent[] = [];
        for (const ev of events) {
            if (ev.type === "joined_guild" || ev.type === "left_guild") {
                const gid = ev.payload.guild_id;
                if (typeof gid === "string" && !(await isVisibleGuild(gid))) continue;
            }
            out.push(ev);
        }
        return { events: out };
    }
}

/* ------------------- ListFriends ------------------------------------- */

export interface ListFriendsInput {
    userId: string;
    /** Edge tells us whether presence is enabled for this deployment. */
    presenceEnabled: boolean;
}

export interface FriendListEntry {
    user_id: string;
    display_name: string;
    rating: number;
    presence: "online" | "offline";
    accepted_at?: string;
}

export class ListFriendsQuery extends Query<{ friends: FriendListEntry[] }> {
    constructor(public readonly input: ListFriendsInput) {
        super();
    }
}

export class ListFriendsHandler implements QueryHandler<ListFriendsQuery> {
    constructor(
        private readonly friends: FriendsReadsSink,
        private readonly users: UserReadsSink,
        private readonly presence: PresenceSink,
    ) { }
    async execute(q: ListFriendsQuery) {
        const { userId, presenceEnabled } = q.input;
        const edges = await this.friends.listFriends(userId);
        const accepted = edges.filter((e) => e.status === "accepted");
        if (accepted.length === 0) return { friends: [] };
        const otherIds = accepted.map((e) =>
            e.fromUserId === userId ? e.toUserId : e.fromUserId,
        );
        const profiles = await Promise.all(
            otherIds.map((id) => this.users.getProfile(id)),
        );
        const onlineSet = presenceEnabled
            ? await this.presence.whichOnline(otherIds)
            : new Set<string>();
        const list = accepted.map((edge, i) => {
            const other = otherIds[i]!;
            const profile = profiles[i];
            return {
                user_id: other,
                display_name: profile?.display_name ?? other.slice(0, 8),
                rating: profile?.rating ?? 0,
                presence: (onlineSet.has(other) ? "online" : "offline") as
                    | "online"
                    | "offline",
                accepted_at: edge.acceptedAt,
            };
        });
        list.sort((a, b) => {
            if (a.presence !== b.presence)
                return a.presence === "online" ? -1 : 1;
            return a.display_name.localeCompare(b.display_name);
        });
        return { friends: list };
    }
}

/* ------------------- ListFriendRequests ------------------------------ */

export interface FriendRequestEntry {
    from_user_id: string;
    display_name: string;
    rating: number;
    created_at: string;
}

export class ListFriendRequestsQuery extends Query<{ incoming: FriendRequestEntry[] }> {
    constructor(public readonly userId: string) {
        super();
    }
}

export class ListFriendRequestsHandler
    implements QueryHandler<ListFriendRequestsQuery> {
    constructor(
        private readonly friends: FriendsReadsSink,
        private readonly users: UserReadsSink,
    ) { }
    async execute(q: ListFriendRequestsQuery) {
        const rows = await this.friends.listIncomingRequests(q.userId);
        const profiles = await Promise.all(
            rows.map((r) => this.users.getProfile(r.fromUserId)),
        );
        return {
            incoming: rows.map((row, i) => ({
                from_user_id: row.fromUserId,
                display_name:
                    profiles[i]?.display_name ?? row.fromUserId.slice(0, 8),
                rating: profiles[i]?.rating ?? 0,
                created_at: row.createdAt,
            })),
        };
    }
}

/* ------------------- SearchUsers ------------------------------------- */

export interface UserSearchResultEntry {
    user_id: string;
    display_name: string;
    rating: number;
}

export class SearchUsersQuery extends Query<{ results: UserSearchResultEntry[] }> {
    constructor(
        public readonly viewerUserId: string,
        public readonly q: string,
    ) {
        super();
    }
}

export class SearchUsersHandler implements QueryHandler<SearchUsersQuery> {
    constructor(private readonly users: UserReadsSink) { }
    async execute(query: SearchUsersQuery) {
        const profiles = await this.users.searchByHandlePrefix(query.q, 25);
        return {
            results: profiles
                .filter((p) => p.user_id !== query.viewerUserId)
                .map((p) => ({
                    user_id: p.user_id,
                    display_name: p.display_name,
                    rating: p.rating,
                })),
        };
    }
}
