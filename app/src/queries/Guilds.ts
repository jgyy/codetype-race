import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";
import type { UserReadsSink } from "./Users";

/* ------------------- shared sink shapes -------------------------------- */

export interface GuildVisibilityRow {
    visibility: "public" | "private";
    [k: string]: unknown;
}

export interface GuildMemberRow {
    userId: string;
    role: "owner" | "mod" | "member";
    joinedAt: string;
}

export interface GuildReadsSink {
    get(id: string): Promise<GuildVisibilityRow | null>;
    getMember(id: string, userId: string): Promise<{ role: string } | null>;
    listMembers(id: string): Promise<GuildMemberRow[]>;
    discoverPublic(q: string, limit: number): Promise<unknown[]>;
}

async function ensureVisibleToViewer(
    guilds: GuildReadsSink,
    guildId: string,
    viewerUserId?: string,
): Promise<GuildVisibilityRow> {
    const guild = await guilds.get(guildId);
    if (!guild) throw new DomainError("guild.not_found", 404);
    if (guild.visibility === "private") {
        if (!viewerUserId) throw new DomainError("guild.not_found", 404);
        const me = await guilds.getMember(guildId, viewerUserId);
        if (!me) throw new DomainError("guild.not_found", 404);
    }
    return guild;
}

/* ------------------- GetGuild ----------------------------------------- */

export interface GetGuildResult {
    guild: GuildVisibilityRow;
    viewer_role: string | null;
}

export class GetGuildQuery extends Query<GetGuildResult> {
    constructor(
        public readonly guildId: string,
        public readonly viewerUserId?: string,
    ) {
        super();
    }
}

export class GetGuildHandler implements QueryHandler<GetGuildQuery> {
    constructor(private readonly guilds: GuildReadsSink) { }
    async execute(q: GetGuildQuery): Promise<GetGuildResult> {
        const guild = await this.guilds.get(q.guildId);
        if (!guild) throw new DomainError("guild.not_found", 404);
        let viewerRole: string | null = null;
        if (q.viewerUserId) {
            const m = await this.guilds.getMember(q.guildId, q.viewerUserId);
            viewerRole = m?.role ?? null;
        }
        if (guild.visibility === "private" && viewerRole === null) {
            throw new DomainError("guild.not_found", 404);
        }
        return { guild, viewer_role: viewerRole };
    }
}

/* ------------------- ListGuilds (public discovery) -------------------- */

export class ListGuildsQuery extends Query<{ guilds: unknown[] }> {
    constructor(public readonly q: string) {
        super();
    }
}

export class ListGuildsHandler implements QueryHandler<ListGuildsQuery> {
    constructor(private readonly guilds: GuildReadsSink) { }
    async execute(q: ListGuildsQuery) {
        return { guilds: await this.guilds.discoverPublic(q.q, 25) };
    }
}

/* ------------------- ListGuildMembers --------------------------------- */

export interface ListGuildMembersInput {
    guildId: string;
    viewerUserId?: string;
}

export interface ListGuildMembersResult {
    members: Array<{
        user_id: string;
        display_name: string;
        rating: number;
        role: string;
        joined_at: string;
    }>;
}

export class ListGuildMembersQuery extends Query<ListGuildMembersResult> {
    constructor(public readonly input: ListGuildMembersInput) {
        super();
    }
}

export class ListGuildMembersHandler
    implements QueryHandler<ListGuildMembersQuery> {
    constructor(
        private readonly guilds: GuildReadsSink,
        private readonly users: UserReadsSink,
    ) { }
    async execute(q: ListGuildMembersQuery): Promise<ListGuildMembersResult> {
        await ensureVisibleToViewer(
            this.guilds,
            q.input.guildId,
            q.input.viewerUserId,
        );
        const members = await this.guilds.listMembers(q.input.guildId);
        const profiles = await Promise.all(
            members.map((m) => this.users.getProfile(m.userId)),
        );
        return {
            members: members.map((m, i) => ({
                user_id: m.userId,
                display_name: profiles[i]?.display_name ?? m.userId.slice(0, 8),
                rating: profiles[i]?.rating ?? 0,
                role: m.role,
                joined_at: m.joinedAt,
            })),
        };
    }
}

/* ------------------- GetGuildLeaderboard ------------------------------ */

export interface GetGuildLeaderboardInput {
    guildId: string;
    viewerUserId?: string;
    /** "*" for global rating, otherwise a language key. */
    lang: string;
}

export interface GuildLeaderboardEntry {
    user_id: string;
    display_name: string;
    rating: number;
    rank: number;
}

export interface GetGuildLeaderboardResult {
    guild_id: string;
    language: string;
    entries: GuildLeaderboardEntry[];
}

export class GetGuildLeaderboardQuery extends Query<GetGuildLeaderboardResult> {
    constructor(public readonly input: GetGuildLeaderboardInput) {
        super();
    }
}

export class GetGuildLeaderboardHandler
    implements QueryHandler<GetGuildLeaderboardQuery> {
    constructor(
        private readonly guilds: GuildReadsSink,
        private readonly users: UserReadsSink,
    ) { }
    async execute(q: GetGuildLeaderboardQuery): Promise<GetGuildLeaderboardResult> {
        await ensureVisibleToViewer(
            this.guilds,
            q.input.guildId,
            q.input.viewerUserId,
        );
        const members = await this.guilds.listMembers(q.input.guildId);
        const profiles = await Promise.all(
            members.map((m) => this.users.getProfile(m.userId)),
        );
        const lang = q.input.lang;
        const scored = members
            .map((m, i) => {
                const p = profiles[i] as
                    | (typeof profiles[number] & { best_wpm?: Record<string, number> })
                    | null;
                const rating =
                    lang === "*"
                        ? p?.rating ?? 0
                        : p?.best_wpm?.[lang]
                            ? Math.round(p.best_wpm[lang]!)
                            : 0;
                return {
                    user_id: m.userId,
                    display_name: p?.display_name ?? m.userId.slice(0, 8),
                    rating,
                };
            })
            .sort((a, b) => b.rating - a.rating);
        return {
            guild_id: q.input.guildId,
            language: lang,
            entries: scored.map((s, i) => ({ ...s, rank: i + 1 })),
        };
    }
}
