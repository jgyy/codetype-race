import {
    type DynamoDBDocumentClient,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    leaderboardGlobalPK,
    leaderboardGlobalShardPK,
    leaderboardLangPK,
    leaderboardLangShardPK,
    leaderboardShardCount,
} from "@codetype/shared/ddb-keys";
import type {
    LeaderboardEntry,
    LeaderboardProjection,
} from "@codetype/domain";

export interface DdbLeaderboardProjectionConfig {
    table: string;
    client: DynamoDBDocumentClient;
    /**
     * Phase 16.1 — set of language codes that should be read in sharded mode.
     * Use the literal "*" entry to enable sharded reads for the global
     * leaderboard. Writers always dual-write shard rows, so flipping a
     * language on/off here requires no backfill.
     */
    shardedLanguages?: ReadonlySet<string>;
}

interface RawLeaderboardItem {
    user_id: string;
    display_name: string;
    rating: number;
    flagged?: boolean;
}

export class DdbLeaderboardProjection implements LeaderboardProjection {
    constructor(private readonly cfg: DdbLeaderboardProjectionConfig) { }

    async getTop(args: {
        language?: string;
        limit: number;
    }): Promise<LeaderboardEntry[]> {
        const sharded = this.shouldShard(args.language);
        const items = sharded
            ? await this.queryShards(args.language, args.limit)
            : await this.querySingle(args.language, args.limit);
        return items.slice(0, args.limit).map((i) => ({
            user_id: i.user_id,
            display_name: i.display_name,
            rating: i.rating,
        }));
    }

    private shouldShard(language: string | undefined): boolean {
        const langs = this.cfg.shardedLanguages;
        if (!langs || langs.size === 0) return false;
        return langs.has(language ?? "*");
    }

    private async querySingle(
        language: string | undefined,
        limit: number,
    ): Promise<RawLeaderboardItem[]> {
        const pk = language ? leaderboardLangPK(language) : leaderboardGlobalPK();
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
                Limit: limit,
            }),
        );
        return (r.Items as RawLeaderboardItem[] | undefined) ?? [];
    }

    private async queryShards(
        language: string | undefined,
        limit: number,
    ): Promise<RawLeaderboardItem[]> {
        const pkFor = (shard: number) =>
            language
                ? leaderboardLangShardPK(language, shard)
                : leaderboardGlobalShardPK(shard);
        const queries = Array.from({ length: leaderboardShardCount }, (_, s) =>
            this.cfg.client.send(
                new QueryCommand({
                    TableName: this.cfg.table,
                    KeyConditionExpression:
                        "PK = :pk AND begins_with(SK, :sk)",
                    FilterExpression:
                        "attribute_not_exists(flagged) OR flagged = :falseVal",
                    ExpressionAttributeValues: {
                        ":pk": pkFor(s),
                        ":sk": "RATING#",
                        ":falseVal": false,
                    },
                    ProjectionExpression: "user_id, display_name, rating",
                    Limit: limit,
                }),
            ),
        );
        const responses = await Promise.all(queries);
        const merged = responses.flatMap(
            (r) => (r.Items as RawLeaderboardItem[] | undefined) ?? [],
        );
        // Each shard's SK already encodes inverted rating, so per-shard items
        // arrive sorted high→low. Dedup by user_id (defensive — sharding hash
        // is stable, so there should be at most one row per user across all
        // shards) and re-sort the merged set.
        const byUser = new Map<string, RawLeaderboardItem>();
        for (const it of merged) {
            const prev = byUser.get(it.user_id);
            if (!prev || it.rating > prev.rating) byUser.set(it.user_id, it);
        }
        return [...byUser.values()].sort((a, b) => b.rating - a.rating);
    }
}
