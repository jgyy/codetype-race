import {
    type DynamoDBDocumentClient,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    leaderboardGlobalPK,
    leaderboardLangPK,
} from "@codetype/shared/ddb-keys";
import type {
    LeaderboardEntry,
    LeaderboardProjection,
} from "@codetype/domain";

export interface DdbLeaderboardProjectionConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

/**
 * DDB-backed read of the leaderboard projection.
 *
 * Persistence shape: items keyed by either LEADERBOARD#GLOBAL or
 * LEADERBOARD#LANG#<lang>, with sort key RATING#<padded>#<userId>.
 * Flagged entries are filtered server-side so a banned account never
 * surfaces.
 *
 * Write path note: as of slice 13.5a the projection is *still*
 * maintained inline by UserRepo.applyRaceResults (transactional with
 * the rating update). Phase 14 will move write responsibility to a
 * ratings DDB-stream consumer; the read contract here doesn't change.
 *
 * Rebuild procedure: see scripts/rebuild-leaderboard.ts. Scans all
 * user profiles, re-derives sort keys, re-emits Put/Delete batches.
 * Run after schema migrations or to recover from drift.
 */
export class DdbLeaderboardProjection implements LeaderboardProjection {
    constructor(private readonly cfg: DdbLeaderboardProjectionConfig) { }

    async getTop(args: {
        language?: string;
        limit: number;
    }): Promise<LeaderboardEntry[]> {
        const pk = args.language
            ? leaderboardLangPK(args.language)
            : leaderboardGlobalPK();
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                FilterExpression:
                    "attribute_not_exists(flagged) OR flagged = :falseVal",
                ExpressionAttributeValues: {
                    ":pk": pk,
                    ":sk": "RATING#",
                    ":falseVal": false,
                },
                Limit: args.limit,
            }),
        );
        return (
            (r.Items as Array<{
                user_id: string;
                display_name: string;
                rating: number;
            }> | undefined) ?? []
        ).map((i) => ({
            user_id: i.user_id,
            display_name: i.display_name,
            rating: i.rating,
        }));
    }
}
