import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    userPK,
    xpLedgerPK,
    xpLedgerSK,
    xpSummarySK,
} from "@codetype/shared/ddb-keys";
import {
    levelFor,
    XP_FIRST_RACE_DAY_BONUS,
    type XpBreakdown,
} from "@codetype/shared/progression/xp";
import type { EventEnvelope } from "@codetype/shared/eventlog";
import { ddb, TABLE } from "../ddb";

export interface XpSummary extends XpBreakdown {
    lastRaceDate?: string;
    updatedAt: string;
}

interface AwardResult {
    delta: number;
    bonusDelta: number;
    summary: XpSummary;
    deduped: boolean;
}

const todayUtc = (iso: string): string => iso.slice(0, 10);

export class XpRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    /**
     * Append a ledger row (idempotent on envelope.id) and atomically bump
     * the user's XPSummary. Returns the new summary.
     *
     * If `bonusOnFirstRaceOfDay` is true and `delta` represents a race
     * event, an additional +XP_FIRST_RACE_DAY_BONUS write is attempted
     * via a conditional update on `lastRaceDate`. The bonus only lands
     * once per UTC day per user.
     */
    async award(
        env: EventEnvelope,
        baseDelta: number,
        opts: { bonusOnFirstRaceOfDay?: boolean } = {},
    ): Promise<AwardResult> {
        const epochMs = Date.parse(env.occurredAt);
        const day = todayUtc(env.occurredAt);
        let deduped = false;

        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: xpLedgerPK(env.userId),
                        SK: xpLedgerSK(epochMs, env.id),
                        event_id: env.id,
                        type: env.type,
                        occurred_at: env.occurredAt,
                        delta: baseDelta,
                        source: env.source,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
        } catch (e: any) {
            if (e?.name === "ConditionalCheckFailedException") {
                deduped = true;
                const summary = (await this.getSummary(env.userId)) ??
                    this.emptySummary(env.userId);
                return { delta: 0, bonusDelta: 0, summary, deduped };
            }
            throw e;
        }

        const baseSummary = await this.bumpSummary(env.userId, baseDelta);
        let bonusDelta = 0;
        let summary = baseSummary;

        if (opts.bonusOnFirstRaceOfDay) {
            const got = await this.tryFirstRaceBonus(env, day);
            if (got) {
                bonusDelta = XP_FIRST_RACE_DAY_BONUS;
                summary = got;
            } else {
                summary = await this.setLastRaceDate(env.userId, day);
            }
        }
        return { delta: baseDelta, bonusDelta, summary, deduped: false };
    }

    private async tryFirstRaceBonus(
        env: EventEnvelope,
        day: string,
    ): Promise<XpSummary | null> {
        const epochMs = Date.parse(env.occurredAt);
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: xpLedgerPK(env.userId),
                        SK: xpLedgerSK(epochMs, `${env.id}:bonus`),
                        event_id: `${env.id}:bonus`,
                        type: "XP_FIRST_RACE_DAY_BONUS",
                        occurred_at: env.occurredAt,
                        delta: XP_FIRST_RACE_DAY_BONUS,
                        source: env.source,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
        } catch (e: any) {
            if (e?.name === "ConditionalCheckFailedException") return null;
            throw e;
        }
        try {
            const r = await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: {
                        PK: userPK(env.userId),
                        SK: xpSummarySK(),
                    },
                    UpdateExpression:
                        "ADD totalXp :d SET lastRaceDate = :day, updatedAt = :now",
                    ConditionExpression:
                        "attribute_not_exists(lastRaceDate) OR lastRaceDate <> :day",
                    ExpressionAttributeValues: {
                        ":d": XP_FIRST_RACE_DAY_BONUS,
                        ":day": day,
                        ":now": new Date().toISOString(),
                    },
                    ReturnValues: "ALL_NEW",
                }),
            );
            return this.summaryFromAttrs(env.userId, r.Attributes);
        } catch (e: any) {
            if (e?.name === "ConditionalCheckFailedException") return null;
            throw e;
        }
    }

    private async setLastRaceDate(
        userId: string,
        day: string,
    ): Promise<XpSummary> {
        const r = await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: userPK(userId), SK: xpSummarySK() },
                UpdateExpression:
                    "SET lastRaceDate = :day, updatedAt = :now ADD totalXp :zero",
                ExpressionAttributeValues: {
                    ":day": day,
                    ":now": new Date().toISOString(),
                    ":zero": 0,
                },
                ReturnValues: "ALL_NEW",
            }),
        );
        return this.summaryFromAttrs(userId, r.Attributes);
    }

    private async bumpSummary(
        userId: string,
        delta: number,
    ): Promise<XpSummary> {
        const r = await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: userPK(userId), SK: xpSummarySK() },
                UpdateExpression:
                    "ADD totalXp :d SET updatedAt = :now",
                ExpressionAttributeValues: {
                    ":d": delta,
                    ":now": new Date().toISOString(),
                },
                ReturnValues: "ALL_NEW",
            }),
        );
        return this.summaryFromAttrs(userId, r.Attributes);
    }

    async getSummary(userId: string): Promise<XpSummary | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: userPK(userId), SK: xpSummarySK() },
            }),
        );
        if (!r.Item) return null;
        return this.summaryFromAttrs(userId, r.Item);
    }

    private emptySummary(_userId: string): XpSummary {
        return {
            ...levelFor(0),
            updatedAt: new Date(0).toISOString(),
        };
    }

    private summaryFromAttrs(
        _userId: string,
        attrs: Record<string, unknown> | undefined,
    ): XpSummary {
        const total = Number(attrs?.totalXp ?? 0);
        const breakdown = levelFor(total);
        return {
            ...breakdown,
            lastRaceDate: attrs?.lastRaceDate as string | undefined,
            updatedAt:
                (attrs?.updatedAt as string | undefined) ??
                new Date().toISOString(),
        };
    }
}

export const xp = new XpRepo();
