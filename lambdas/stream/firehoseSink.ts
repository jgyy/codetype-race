import {
    FirehoseClient,
    PutRecordBatchCommand,
} from "@aws-sdk/client-firehose";
import type { DynamoDBStreamHandler } from "aws-lambda";
import { withStream } from "../src/middleware";
import { recordsToEnvelopes } from "../src/eventlog-map";

const STREAM_NAME = process.env.FIREHOSE_STREAM_NAME ?? "";
const REGION = process.env.AWS_REGION;

const firehose = new FirehoseClient({ region: REGION });

const FIREHOSE_BATCH_LIMIT = 500;

function chunk<T>(arr: T[], size: number): T[][] {
    if (arr.length <= size) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export const handler: DynamoDBStreamHandler = withStream(async (event) => {
    if (!STREAM_NAME) {
        console.log(
            JSON.stringify({ firehose_skip: "no FIREHOSE_STREAM_NAME set" }),
        );
        return;
    }
    const envelopes = recordsToEnvelopes(event.Records);
    if (envelopes.length === 0) return;

    for (const batch of chunk(envelopes, FIREHOSE_BATCH_LIMIT)) {
        const records = batch.map((e) => ({
            Data: new TextEncoder().encode(JSON.stringify(e) + "\n"),
        }));
        const result = await firehose.send(
            new PutRecordBatchCommand({
                DeliveryStreamName: STREAM_NAME,
                Records: records,
            }),
        );
        if ((result.FailedPutCount ?? 0) > 0) {
            console.log(
                JSON.stringify({
                    firehose_partial_failure: result.FailedPutCount,
                    total: batch.length,
                }),
            );
        }
    }
});
