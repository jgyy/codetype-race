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
