import type {
    LeaderboardEntry,
    LeaderboardProjection,
} from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

export interface GetLeaderboardInput {
    language?: string;
    limit: number;
}

export interface GetLeaderboardResult {
    entries: LeaderboardEntry[];
}

export class GetLeaderboardQuery extends Query<GetLeaderboardResult> {
    constructor(public readonly input: GetLeaderboardInput) {
        super();
    }
}

export class GetLeaderboardHandler
    implements QueryHandler<GetLeaderboardQuery> {
    constructor(private readonly projection: LeaderboardProjection) { }

    async execute(q: GetLeaderboardQuery): Promise<GetLeaderboardResult> {
        const entries = await this.projection.getTop({
            language: q.input.language,
            limit: q.input.limit,
        });
        return { entries };
    }
}
