import { v5 as uuidv5 } from "uuid";
import type { DynamoDBRecord } from "aws-lambda";
import type { EventEnvelope, EventType } from "@codetype/shared/eventlog";

const NAMESPACE = "6f0e1f2a-9c8b-4f3a-9d7e-1a2b3c4d5e6f";

const s = (a: any): string | undefined => a?.S;
const n = (a: any): number | undefined => {
    const v = a?.N;
    return v == null ? undefined : Number(v);
};

function envelopeId(seed: string): string {
    return uuidv5(seed, NAMESPACE);
}

function tsToIso(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toISOString();
}

export function recordToEnvelope(
    record: DynamoDBRecord,
): EventEnvelope | null {
    const keys = record.dynamodb?.Keys ?? {};
    const newImg = record.dynamodb?.NewImage;
    const eventName = record.eventName;
    const pk = s(keys.PK);
    const sk = s(keys.SK);
    if (!pk || !sk) return null;

    if (
        eventName === "INSERT" &&
        pk.startsWith("USER#") &&
        sk.startsWith("RACE#") &&
        newImg
    ) {
        const userId = pk.slice("USER#".length);
        const finishedAt = n(newImg.finished_at);
        const roomId = s(newImg.room_id);
        if (finishedAt == null || !roomId) return null;
        const wpm = n(newImg.scaled_wpm) ?? n(newImg.net_wpm);
        return {
            id: envelopeId(`RACE_FINISHED:${userId}:${roomId}:${finishedAt}`),
            type: "RACE_FINISHED",
            occurredAt: tsToIso(finishedAt),
            userId,
            payload: {
                roomId,
                displayName: s(newImg.display_name) ?? "",
                finishedAt,
                language: s(newImg.language),
                wpm,
                accuracy: n(newImg.accuracy),
            },
            source: "stream",
            v: 1,
        };
    }

    if (
        eventName === "INSERT" &&
        pk.startsWith("DAILY#") &&
        sk.startsWith("USER#") &&
        newImg
    ) {
        const date = pk.slice("DAILY#".length);
        const userId = sk.slice("USER#".length);
        const completedAt = n(newImg.completed_at) ?? n(newImg.finished_at);
        if (completedAt == null) return null;
        return {
            id: envelopeId(`DAILY_DONE:${userId}:${date}`),
            type: "DAILY_DONE",
            occurredAt: tsToIso(completedAt),
            userId,
            payload: { date, completedAt },
            source: "stream",
            v: 1,
        };
    }

    if (pk.startsWith("TOURN#") && sk.startsWith("MATCH#") && newImg) {
        const oldImg = record.dynamodb?.OldImage;
        const newWinner = s(newImg.winnerId);
        const oldWinner = s(oldImg?.winnerId);
        if (newWinner && newWinner !== oldWinner) {
            const tournId = pk.slice("TOURN#".length);
            const parts = sk.slice("MATCH#".length).split("#");
            const round = Number(parts[0]);
            if (!Number.isFinite(round)) return null;
            const completedAt =
                n(newImg.completedAt) ?? Math.floor(Date.now() / 1000);
            return {
                id: envelopeId(
                    `TOURN_WON:${newWinner}:${tournId}:${round}:${parts[1] ?? ""}`,
                ),
                type: "TOURN_WON",
                occurredAt: tsToIso(completedAt),
                userId: newWinner,
                payload: { tournId, round },
                source: "stream",
                v: 1,
            };
        }
    }

    return null;
}

export function recordsToEnvelopes(
    records: DynamoDBRecord[],
): EventEnvelope[] {
    const out: EventEnvelope[] = [];
    for (const r of records) {
        const e = recordToEnvelope(r);
        if (e) out.push(e);
    }
    return out;
}

export const __test = { envelopeId };
