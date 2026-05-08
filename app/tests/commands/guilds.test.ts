import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    CreateGuildCommand,
    CreateGuildHandler,
    CreateGuildInviteCommand,
    CreateGuildInviteHandler,
    LeaveOrKickGuildMemberCommand,
    LeaveOrKickGuildMemberHandler,
    RedeemGuildInviteCommand,
    RedeemGuildInviteHandler,
    TransferGuildOwnershipCommand,
    TransferGuildOwnershipHandler,
    UpdateGuildCommand,
    UpdateGuildHandler,
    type FeedAppender,
    type GuildLite,
    type GuildMemberLite,
    type GuildRole,
    type GuildsSink,
} from "../../src";
import { FakeRandom } from "../fakes";

class FakeGuilds implements GuildsSink {
    rows = new Map<string, GuildLite>();
    members = new Map<string, GuildMemberLite>();
    invites = new Map<string, { guildId: string; expiresAt: string }>();
    feed: Array<{ op: string; args: unknown[] }> = [];
    seedGuild(g: GuildLite) {
        this.rows.set(g.id, g);
        return this;
    }
    seedMember(guildId: string, userId: string, role: GuildRole) {
        this.members.set(`${guildId}|${userId}`, { role });
        return this;
    }
    seedInvite(code: string, guildId: string) {
        this.invites.set(code, { guildId, expiresAt: "2030-01-01" });
        return this;
    }
    async create(g: GuildLite) {
        this.feed.push({ op: "create", args: [g] });
        this.rows.set(g.id, g);
    }
    async get(id: string) {
        return this.rows.get(id) ?? null;
    }
    async update(id: string, patch: Partial<GuildLite>, prev: GuildLite) {
        const next = { ...prev, ...patch };
        this.rows.set(id, next);
        return next;
    }
    async getMember(guildId: string, userId: string) {
        return this.members.get(`${guildId}|${userId}`) ?? null;
    }
    async removeMember(guildId: string, userId: string) {
        this.members.delete(`${guildId}|${userId}`);
        this.feed.push({ op: "removeMember", args: [guildId, userId] });
    }
    async transferOwnership(id: string, fromId: string, toId: string) {
        const g = this.rows.get(id)!;
        this.rows.set(id, { ...g, ownerId: toId });
        this.feed.push({ op: "transfer", args: [id, fromId, toId] });
    }
    async addMember(guildId: string, userId: string, role: GuildRole) {
        this.members.set(`${guildId}|${userId}`, { role });
    }
    async createInvite(guildId: string, code: string) {
        const expiresAt = "2030-01-01";
        this.invites.set(code, { guildId, expiresAt });
        return { code, expiresAt };
    }
    async findInviteByCode(code: string) {
        const i = this.invites.get(code);
        return i ? { guildId: i.guildId } : null;
    }
}

class FakeFeed implements FeedAppender {
    appends: Array<{ userId: string; type: string }> = [];
    async append(userId: string, type: string) {
        this.appends.push({ userId, type });
    }
}

describe("CreateGuildCommand", () => {
    test("uses random.uuid + builds owner-self guild", async () => {
        const guilds = new FakeGuilds();
        const random = new FakeRandom().queueUuid("11111111-1111-7111-8111-111111111111");
        const out = await new CreateGuildHandler(guilds, random).execute(
            new CreateGuildCommand({
                ownerId: "u1",
                name: "G",
                slug: "g",
                visibility: "public",
                nowIso: "2026-05-08T00:00:00.000Z",
            }),
        );
        expect(out.id).toBe("11111111-1111-7111-8111-111111111111");
        expect(out.ownerId).toBe("u1");
        expect(out.memberCount).toBe(1);
        expect(guilds.rows.size).toBe(1);
    });
});

describe("UpdateGuildCommand", () => {
    test("404 when guild missing", async () => {
        await expect(
            new UpdateGuildHandler(new FakeGuilds()).execute(
                new UpdateGuildCommand({ actorId: "u1", guildId: "missing", patch: {} }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("403 for non-owner", async () => {
        const guilds = new FakeGuilds().seedGuild({
            id: "g1",
            name: "G",
            slug: "g",
            visibility: "public",
            ownerId: "owner",
            description: "",
            memberCount: 1,
            createdAt: "x",
        });
        await expect(
            new UpdateGuildHandler(guilds).execute(
                new UpdateGuildCommand({ actorId: "u2", guildId: "g1", patch: {} }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("owner update succeeds", async () => {
        const guilds = new FakeGuilds().seedGuild({
            id: "g1",
            name: "G",
            slug: "g",
            visibility: "public",
            ownerId: "u1",
            description: "",
            memberCount: 1,
            createdAt: "x",
        });
        const out = await new UpdateGuildHandler(guilds).execute(
            new UpdateGuildCommand({
                actorId: "u1",
                guildId: "g1",
                patch: { description: "new" },
            }),
        );
        expect(out.description).toBe("new");
    });
});

describe("TransferGuildOwnershipCommand", () => {
    function setup() {
        const guilds = new FakeGuilds()
            .seedGuild({
                id: "g1",
                name: "G",
                slug: "g",
                visibility: "public",
                ownerId: "u1",
                description: "",
                memberCount: 2,
                createdAt: "x",
            })
            .seedMember("g1", "u1", "owner")
            .seedMember("g1", "u2", "member");
        return { guilds, handler: new TransferGuildOwnershipHandler(guilds) };
    }

    test("403 for non-owner", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new TransferGuildOwnershipCommand({
                    actorId: "u2",
                    guildId: "g1",
                    newOwnerId: "u3",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("400 when new owner is not a member", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new TransferGuildOwnershipCommand({
                    actorId: "u1",
                    guildId: "g1",
                    newOwnerId: "stranger",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("happy path transfers", async () => {
        const { handler, guilds } = setup();
        const out = await handler.execute(
            new TransferGuildOwnershipCommand({
                actorId: "u1",
                guildId: "g1",
                newOwnerId: "u2",
            }),
        );
        expect(out.status).toBe("transferred");
        expect(guilds.rows.get("g1")!.ownerId).toBe("u2");
    });
});

describe("LeaveOrKickGuildMemberCommand", () => {
    function setup() {
        const guilds = new FakeGuilds()
            .seedGuild({
                id: "g1",
                name: "G",
                slug: "g",
                visibility: "public",
                ownerId: "u1",
                description: "",
                memberCount: 3,
                createdAt: "x",
            })
            .seedMember("g1", "u1", "owner")
            .seedMember("g1", "u2", "mod")
            .seedMember("g1", "u3", "member");
        const feed = new FakeFeed();
        return { guilds, feed, handler: new LeaveOrKickGuildMemberHandler(guilds, feed) };
    }

    test("self-leave bypasses kick checks", async () => {
        const { handler } = setup();
        const out = await handler.execute(
            new LeaveOrKickGuildMemberCommand({
                actorId: "u3",
                guildId: "g1",
                targetUserId: "u3",
            }),
        );
        expect(out.status).toBe("removed");
    });

    test("member cannot kick mod", async () => {
        const { handler } = setup();
        await expect(
            handler.execute(
                new LeaveOrKickGuildMemberCommand({
                    actorId: "u3",
                    guildId: "g1",
                    targetUserId: "u2",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("owner kicks mod", async () => {
        const { handler, guilds, feed } = setup();
        const out = await handler.execute(
            new LeaveOrKickGuildMemberCommand({
                actorId: "u1",
                guildId: "g1",
                targetUserId: "u2",
            }),
        );
        expect(out.status).toBe("removed");
        expect(guilds.members.has("g1|u2")).toBe(false);
        expect(feed.appends.some((a) => a.userId === "u2" && a.type === "left_guild")).toBe(true);
    });
});

describe("Invite commands", () => {
    test("create requires non-member role", async () => {
        const guilds = new FakeGuilds().seedMember("g1", "u1", "member");
        await expect(
            new CreateGuildInviteHandler(guilds).execute(
                new CreateGuildInviteCommand({
                    actorId: "u1",
                    guildId: "g1",
                    code: "AB12CD",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("mod creates invite", async () => {
        const guilds = new FakeGuilds().seedMember("g1", "u1", "mod");
        const out = await new CreateGuildInviteHandler(guilds).execute(
            new CreateGuildInviteCommand({
                actorId: "u1",
                guildId: "g1",
                code: "AB12CD",
            }),
        );
        expect(out.code).toBe("AB12CD");
    });

    test("redeem returns existing role for already-member", async () => {
        const guilds = new FakeGuilds()
            .seedInvite("INV1", "g1")
            .seedMember("g1", "u9", "mod");
        const feed = new FakeFeed();
        const out = await new RedeemGuildInviteHandler(guilds, feed).execute(
            new RedeemGuildInviteCommand({
                actorId: "u9",
                code: "INV1",
                nowIso: "2026-05-08",
            }),
        );
        expect(out.role).toBe("mod");
        expect(feed.appends).toHaveLength(0);
    });

    test("redeem adds new member + appends feed", async () => {
        const guilds = new FakeGuilds().seedInvite("INV2", "g2");
        const feed = new FakeFeed();
        const out = await new RedeemGuildInviteHandler(guilds, feed).execute(
            new RedeemGuildInviteCommand({
                actorId: "u10",
                code: "INV2",
                nowIso: "2026-05-08",
            }),
        );
        expect(out).toEqual({ guild_id: "g2", role: "member" });
        expect(feed.appends).toEqual([{ userId: "u10", type: "joined_guild" }]);
    });

    test("404 when invite code unknown", async () => {
        await expect(
            new RedeemGuildInviteHandler(new FakeGuilds(), new FakeFeed()).execute(
                new RedeemGuildInviteCommand({
                    actorId: "u1",
                    code: "MISS01",
                    nowIso: "x",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });
});
