import {
    DomainError,
    type Random,
} from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";
import type { FeedAppender } from "../ws/FinishRace";

export type GuildRole = "owner" | "mod" | "member";
export type GuildVisibility = "public" | "private";

export interface GuildLite {
    id: string;
    name: string;
    slug: string;
    visibility: GuildVisibility;
    ownerId: string;
    description: string;
    memberCount: number;
    createdAt: string;
}

export interface GuildMemberLite {
    role: GuildRole;
}

export interface GuildInviteLite {
    code: string;
    expiresAt: string;
}

export interface GuildInviteRecord {
    guildId: string;
}

export interface GuildUpdateInput {
    name?: string;
    description?: string;
    visibility?: GuildVisibility;
}

export interface GuildsSink {
    create(guild: GuildLite): Promise<void>;
    get(id: string): Promise<GuildLite | null>;
    update(
        id: string,
        input: GuildUpdateInput,
        prev: GuildLite,
    ): Promise<GuildLite>;
    getMember(id: string, userId: string): Promise<GuildMemberLite | null>;
    removeMember(id: string, userId: string): Promise<void>;
    transferOwnership(id: string, fromId: string, toId: string): Promise<void>;
    addMember(
        id: string,
        userId: string,
        role: GuildRole,
        ts: string,
    ): Promise<void>;
    createInvite(
        id: string,
        code: string,
        byId: string,
    ): Promise<GuildInviteLite>;
    findInviteByCode(code: string): Promise<GuildInviteRecord | null>;
}

const ROLE_RANK: Record<GuildRole, number> = { owner: 3, mod: 2, member: 1 };
function canKick(actor: GuildRole, target: GuildRole): boolean {
    return ROLE_RANK[actor] > ROLE_RANK[target];
}

/* ------------------------- CreateGuild --------------------------------- */

export interface CreateGuildInput {
    ownerId: string;
    name: string;
    slug: string;
    visibility: GuildVisibility;
    description?: string;
    /** ISO-8601 string from edge. */
    nowIso: string;
}

export class CreateGuildCommand extends Command<GuildLite> {
    constructor(public readonly input: CreateGuildInput) {
        super();
    }
}

export class CreateGuildHandler implements CommandHandler<CreateGuildCommand> {
    constructor(
        private readonly guilds: GuildsSink,
        private readonly random: Random,
    ) { }

    async execute(c: CreateGuildCommand): Promise<GuildLite> {
        const guild: GuildLite = {
            id: this.random.uuid(),
            name: c.input.name,
            slug: c.input.slug,
            visibility: c.input.visibility,
            ownerId: c.input.ownerId,
            description: c.input.description ?? "",
            memberCount: 1,
            createdAt: c.input.nowIso,
        };
        await this.guilds.create(guild);
        return guild;
    }
}

/* ------------------------- UpdateGuild --------------------------------- */

export interface UpdateGuildInput {
    actorId: string;
    guildId: string;
    patch: GuildUpdateInput;
}

export class UpdateGuildCommand extends Command<GuildLite> {
    constructor(public readonly input: UpdateGuildInput) {
        super();
    }
}

export class UpdateGuildHandler implements CommandHandler<UpdateGuildCommand> {
    constructor(private readonly guilds: GuildsSink) { }

    async execute(c: UpdateGuildCommand): Promise<GuildLite> {
        const guild = await this.guilds.get(c.input.guildId);
        if (!guild) throw new DomainError("guild.not_found", 404);
        if (guild.ownerId !== c.input.actorId) {
            throw new DomainError("guild.forbidden", 403);
        }
        return this.guilds.update(c.input.guildId, c.input.patch, guild);
    }
}

/* ------------------------- TransferGuildOwnership ---------------------- */

export interface TransferGuildOwnershipInput {
    actorId: string;
    guildId: string;
    newOwnerId: string;
}

export interface TransferGuildOwnershipResult {
    status: "transferred";
}

export class TransferGuildOwnershipCommand extends Command<TransferGuildOwnershipResult> {
    constructor(public readonly input: TransferGuildOwnershipInput) {
        super();
    }
}

export class TransferGuildOwnershipHandler
    implements CommandHandler<TransferGuildOwnershipCommand> {
    constructor(private readonly guilds: GuildsSink) { }

    async execute(c: TransferGuildOwnershipCommand): Promise<TransferGuildOwnershipResult> {
        const guild = await this.guilds.get(c.input.guildId);
        if (!guild) throw new DomainError("guild.not_found", 404);
        if (guild.ownerId !== c.input.actorId) {
            throw new DomainError("guild.forbidden", 403);
        }
        const member = await this.guilds.getMember(c.input.guildId, c.input.newOwnerId);
        if (!member) {
            throw new DomainError(
                "guild.new_owner_not_member",
                400,
                "new owner is not a member",
            );
        }
        await this.guilds.transferOwnership(
            c.input.guildId,
            c.input.actorId,
            c.input.newOwnerId,
        );
        return { status: "transferred" };
    }
}

/* ------------------------- LeaveOrKickGuildMember --------------------- */

export interface LeaveOrKickInput {
    actorId: string;
    guildId: string;
    /** When equal to actorId → leave; otherwise → kick. */
    targetUserId: string;
}

export interface LeaveOrKickResult {
    status: "removed";
}

export class LeaveOrKickGuildMemberCommand extends Command<LeaveOrKickResult> {
    constructor(public readonly input: LeaveOrKickInput) {
        super();
    }
}

export class LeaveOrKickGuildMemberHandler
    implements CommandHandler<LeaveOrKickGuildMemberCommand> {
    constructor(
        private readonly guilds: GuildsSink,
        private readonly feed: FeedAppender,
    ) { }

    async execute(c: LeaveOrKickGuildMemberCommand): Promise<LeaveOrKickResult> {
        const guild = await this.guilds.get(c.input.guildId);
        if (!guild) throw new DomainError("guild.not_found", 404);
        const isKick = c.input.targetUserId !== c.input.actorId;
        if (isKick) {
            const actor = await this.guilds.getMember(
                c.input.guildId,
                c.input.actorId,
            );
            const target = await this.guilds.getMember(
                c.input.guildId,
                c.input.targetUserId,
            );
            if (!actor) throw new DomainError("guild.forbidden", 403);
            if (!target) throw new DomainError("guild.member_not_found", 404);
            if (!canKick(actor.role, target.role)) {
                throw new DomainError("guild.cant_kick", 403);
            }
        }
        await this.guilds.removeMember(c.input.guildId, c.input.targetUserId);
        await this.feed.append(c.input.targetUserId, "left_guild", {
            guild_id: c.input.guildId,
        });
        return { status: "removed" };
    }
}

/* ------------------------- CreateGuildInvite -------------------------- */

export interface CreateGuildInviteInput {
    actorId: string;
    guildId: string;
    /** Edge generates the candidate code (uses generateRoomCode helper). */
    code: string;
}

export interface CreateGuildInviteResult {
    code: string;
    expires_at: string;
}

export class CreateGuildInviteCommand extends Command<CreateGuildInviteResult> {
    constructor(public readonly input: CreateGuildInviteInput) {
        super();
    }
}

export class CreateGuildInviteHandler
    implements CommandHandler<CreateGuildInviteCommand> {
    constructor(private readonly guilds: GuildsSink) { }

    async execute(c: CreateGuildInviteCommand): Promise<CreateGuildInviteResult> {
        const member = await this.guilds.getMember(c.input.guildId, c.input.actorId);
        if (!member || member.role === "member") {
            throw new DomainError("guild.invite_forbidden", 403);
        }
        const result = await this.guilds.createInvite(
            c.input.guildId,
            c.input.code,
            c.input.actorId,
        );
        return { code: result.code, expires_at: result.expiresAt };
    }
}

/* ------------------------- RedeemGuildInvite -------------------------- */

export interface RedeemGuildInviteInput {
    actorId: string;
    code: string;
    nowIso: string;
}

export interface RedeemGuildInviteResult {
    guild_id: string;
    role: GuildRole;
}

export class RedeemGuildInviteCommand extends Command<RedeemGuildInviteResult> {
    constructor(public readonly input: RedeemGuildInviteInput) {
        super();
    }
}

export class RedeemGuildInviteHandler
    implements CommandHandler<RedeemGuildInviteCommand> {
    constructor(
        private readonly guilds: GuildsSink,
        private readonly feed: FeedAppender,
    ) { }

    async execute(c: RedeemGuildInviteCommand): Promise<RedeemGuildInviteResult> {
        const invite = await this.guilds.findInviteByCode(c.input.code);
        if (!invite) throw new DomainError("invite.not_found", 404);
        const existing = await this.guilds.getMember(invite.guildId, c.input.actorId);
        if (existing) {
            return { guild_id: invite.guildId, role: existing.role };
        }
        await this.guilds.addMember(
            invite.guildId,
            c.input.actorId,
            "member",
            c.input.nowIso,
        );
        await this.feed.append(c.input.actorId, "joined_guild", {
            guild_id: invite.guildId,
        });
        return { guild_id: invite.guildId, role: "member" };
    }
}
