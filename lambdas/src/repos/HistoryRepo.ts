import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { finishedGSI1SK, hostGSI1PK } from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";

export interface PracticeEntry {
    user_id: string;
    snippet_id: string;
    finished_at: number;
    chars_typed: number;
    errors: number;
    duration_ms: number;
    gross_wpm: number;
    net_wpm: number;
    accuracy: number;
    scaled_wpm: number;
}

const userPracticePK = (userId: string) => `USER#${userId}`;
const practiceSK = (finishedAt: number) => `PRACTICE#${finishedAt}`;

export class HistoryRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async listForHost(hostId: string, limit = 50): Promise<Record<string, unknown>[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": hostGSI1PK(hostId) },
                ScanIndexForward: false,
                Limit: limit,
            }),
        );
        return (r.Items as Record<string, unknown>[] | undefined) ?? [];
    }

    async appendPractice(entry: PracticeEntry): Promise<void> {
        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    PK: userPracticePK(entry.user_id),
                    SK: practiceSK(entry.finished_at),
                    GSI1PK: hostGSI1PK(entry.user_id),
                    GSI1SK: finishedGSI1SK(entry.finished_at),
                    mode: "practice",
                    ...entry,
                },
            }),
        );
    }
}

export const history = new HistoryRepo();
