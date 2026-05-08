import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

export interface UserProfile {
    user_id: string;
    display_name: string;
    rating: number;
    [k: string]: unknown;
}

export interface RaceHistoryEntry {
    [k: string]: unknown;
}

export interface UserReadsSink {
    getProfile(userId: string): Promise<UserProfile | null>;
    listRecentRaces(userId: string, limit: number): Promise<RaceHistoryEntry[]>;
    getOrCreate(userId: string, displayName: string): Promise<UserProfile>;
    searchByHandlePrefix(prefix: string, limit: number): Promise<UserProfile[]>;
}

export interface HistoryReadsSink {
    listForHost(userId: string): Promise<unknown[]>;
}

/* ------------------- GetUser ------------------------------------------ */

export interface GetUserInput {
    /** The user being asked about. */
    targetUserId: string;
    /** The viewer's resolved id (or undefined if anonymous). */
    viewerUserId?: string;
    /** Pre-derived display-name fallback (from JWT claims) for first-create. */
    displayNameFallback: string;
    /** Viewer's group claims, surfaced only when viewer == target. */
    viewerGroups: string[];
}

export interface GetUserResult {
    profile: UserProfile;
    recent: RaceHistoryEntry[];
    groups?: string[];
}

export class GetUserQuery extends Query<GetUserResult> {
    constructor(public readonly input: GetUserInput) {
        super();
    }
}

export class GetUserHandler implements QueryHandler<GetUserQuery> {
    constructor(private readonly users: UserReadsSink) { }
    async execute(q: GetUserQuery): Promise<GetUserResult> {
        const { targetUserId, viewerUserId, displayNameFallback, viewerGroups } = q.input;
        let profile = await this.users.getProfile(targetUserId);
        if (!profile) {
            if (targetUserId !== viewerUserId) {
                throw new DomainError("user.not_found", 404);
            }
            profile = await this.users.getOrCreate(
                targetUserId,
                displayNameFallback,
            );
        }
        const recent = await this.users.listRecentRaces(targetUserId, 20);
        const groups = targetUserId === viewerUserId ? viewerGroups : undefined;
        return { profile, recent, groups };
    }
}

/* ------------------- ListHistory -------------------------------------- */

export class ListHistoryQuery extends Query<{ results: unknown[] }> {
    constructor(public readonly userId: string) {
        super();
    }
}

export class ListHistoryHandler implements QueryHandler<ListHistoryQuery> {
    constructor(private readonly history: HistoryReadsSink) { }
    async execute(q: ListHistoryQuery) {
        return { results: await this.history.listForHost(q.userId) };
    }
}
