import {
    FirehoseClient,
    PutRecordBatchCommand,
} from "@aws-sdk/client-firehose";
import type { DynamoDBStreamHandler } from "aws-lambda";
import { withStream } from "../src/middleware";
import { recordsToEnvelopes } from "../src/eventlog-map";
import { awardForEnvelope } from "../src/progression/awardXp";
import { runAchievementsForEnvelope } from "../src/progression/runAchievements";
import { runQuestsForEnvelope } from "../src/progression/runQuests";
import { pushToUser } from "../src/progression/userPush";

const STREAM_NAME = process.env.FIREHOSE_STREAM_NAME ?? "";
const ENABLE_PROGRESSION =
    (process.env.ENABLE_PROGRESSION ?? "false").toLowerCase() === "true";
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

    if (ENABLE_PROGRESSION) {
        const xpResults = await Promise.all(
            envelopes.map((e) => awardForEnvelope(e)),
        );
        const achResults = await Promise.all(
            envelopes.map((e) => runAchievementsForEnvelope(e)),
        );
        const questResults = await Promise.all(
            envelopes.map((e) => runQuestsForEnvelope(e)),
        );
        await Promise.all(
            envelopes.map(async (e, i) => {
                const xpR = xpResults[i];
                if (xpR && xpR.delta + xpR.bonusDelta > 0) {
                    await pushToUser(e.userId, {
                        type: "XP_GAINED",
                        v: 1,
                        delta: xpR.delta + xpR.bonusDelta,
                        total_xp: xpR.totalXp,
                        level: xpR.level,
                    });
                    if (xpR.leveledUp) {
                        await pushToUser(e.userId, {
                            type: "LEVEL_UP",
                            v: 1,
                            level: xpR.level,
                            total_xp: xpR.totalXp,
                        });
                    }
                }
                for (const u of achResults[i] ?? []) {
                    await pushToUser(e.userId, {
                        type: "ACHIEVEMENT_UNLOCKED",
                        v: 1,
                        achievement_id: u.achievementId,
                        xp_awarded: u.xpAwarded,
                    });
                }
                for (const q of questResults[i] ?? []) {
                    if (q.completed) {
                        await pushToUser(e.userId, {
                            type: "QUEST_COMPLETED",
                            v: 1,
                            quest_id: q.questId,
                            rotation_id: q.rotationId,
                        });
                    }
                }
            }),
        );
    }

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
