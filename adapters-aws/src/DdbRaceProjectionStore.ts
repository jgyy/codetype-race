import {
    type DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    racePK,
    raceProjectionSK,
} from "@codetype/shared/ddb-keys";
import {
    ProjectionConflictError,
    type RaceProjectionStore,
} from "@codetype/domain/ports/RaceProjectionStore";
import type { RaceState } from "@codetype/domain/RaceReducer";

export interface DdbRaceProjectionStoreConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

function stateFromItem(item: Record<string, unknown>): RaceState {
    return {
        id: item.id == null ? null : String(item.id),
        status: item.status as RaceState["status"],
        players: (item.players as RaceState["players"]) ?? {},
        countdownStartedAt:
            item.countdownStartedAt == null ? null : String(item.countdownStartedAt),
        startedAt: item.startedAt == null ? null : String(item.startedAt),
        finishedAt: item.finishedAt == null ? null : String(item.finishedAt),
        lastSeq: Number(item.lastSeq),
    };
}

export class DdbRaceProjectionStore implements RaceProjectionStore {
    constructor(private readonly cfg: DdbRaceProjectionStoreConfig) { }

    async get(raceId: string): Promise<RaceState | null> {
        const r = await this.cfg.client.send(
            new GetCommand({
                TableName: this.cfg.table,
                Key: { PK: racePK(raceId), SK: raceProjectionSK() },
            }),
        );
        return r.Item ? stateFromItem(r.Item) : null;
    }

    async put(args: {
        raceId: string;
        state: RaceState;
        expectedLastSeq: number | null;
    }): Promise<void> {
        const item = {
            PK: racePK(args.raceId),
            SK: raceProjectionSK(),
            ...args.state,
            updatedAt: new Date().toISOString(),
        };
        const condition =
            args.expectedLastSeq === null
                ? "attribute_not_exists(PK)"
                : "attribute_exists(PK) AND lastSeq = :expected";
        const values =
            args.expectedLastSeq === null
                ? undefined
                : { ":expected": args.expectedLastSeq };
        try {
            await this.cfg.client.send(
                new PutCommand({
                    TableName: this.cfg.table,
                    Item: item,
                    ConditionExpression: condition,
                    ...(values ? { ExpressionAttributeValues: values } : {}),
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw new ProjectionConflictError(
                    `projection lastSeq mismatch for ${args.raceId} (expected ${args.expectedLastSeq})`,
                );
            }
            throw e;
        }
    }
}
