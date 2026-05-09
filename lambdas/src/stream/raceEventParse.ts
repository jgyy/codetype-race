import type { DynamoDBRecord } from "aws-lambda";
import type { RaceEvent, RaceEventType } from "@codetype/domain/events/RaceEvent";
import { RACE_EVENT_TYPES } from "@codetype/domain/events/RaceEvent";

type AttrValue = Record<string, unknown> | undefined;
type Image = Record<string, AttrValue>;

const RACE_EVENT_TYPES_SET: ReadonlySet<string> = new Set(RACE_EVENT_TYPES);

function unmarshallAttr(v: unknown): unknown {
    if (v == null || typeof v !== "object") return undefined;
    const a = v as Record<string, unknown>;
    if ("NULL" in a) return null;
    if ("S" in a) return a.S as string;
    if ("N" in a) return Number(a.N);
    if ("BOOL" in a) return Boolean(a.BOOL);
    if ("M" in a) {
        const out: Record<string, unknown> = {};
        for (const [k, sub] of Object.entries(a.M as Record<string, unknown>)) {
            out[k] = unmarshallAttr(sub);
        }
        return out;
    }
    if ("L" in a) {
        return (a.L as unknown[]).map(unmarshallAttr);
    }
    return undefined;
}

function s(image: Image, key: string): string | undefined {
    const v = unmarshallAttr(image[key]);
    return typeof v === "string" ? v : undefined;
}
function n(image: Image, key: string): number | undefined {
    const v = unmarshallAttr(image[key]);
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function maybeNullableString(image: Image, key: string): string | null {
    const v = unmarshallAttr(image[key]);
    if (v === null || v === undefined) return null;
    return String(v);
}

export function recordToRaceEvent(record: DynamoDBRecord): RaceEvent | null {
    if (record.eventName !== "INSERT") return null;
    const keys = (record.dynamodb?.Keys ?? {}) as Image;
    const newImg = record.dynamodb?.NewImage as Image | undefined;
    if (!newImg) return null;
    const pk = s(keys, "PK");
    const sk = s(keys, "SK");
    if (!pk?.startsWith("RACE#") || !sk?.startsWith("EV#")) return null;

    const type = s(newImg, "type");
    if (!type || !RACE_EVENT_TYPES_SET.has(type)) return null;
    const raceId = s(newImg, "raceId");
    const seq = n(newImg, "seq");
    const occurredAt = s(newImg, "occurredAt");
    const correlationId = s(newImg, "correlationId");
    if (!raceId || seq == null || !occurredAt || !correlationId) return null;

    const payloadRaw = unmarshallAttr(newImg.payload);
    const payload =
        payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
            ? (payloadRaw as Record<string, unknown>)
            : {};

    return {
        raceId,
        seq,
        type: type as RaceEventType,
        occurredAt,
        actorId: maybeNullableString(newImg, "actorId"),
        payload,
        commandId: maybeNullableString(newImg, "commandId"),
        causationId: maybeNullableString(newImg, "causationId"),
        correlationId,
    };
}

export function recordsToRaceEvents(
    records: readonly DynamoDBRecord[],
): RaceEvent[] {
    const out: RaceEvent[] = [];
    for (const r of records) {
        const e = recordToRaceEvent(r);
        if (e) out.push(e);
    }
    return out;
}

export function groupByRace(events: readonly RaceEvent[]): Map<string, RaceEvent[]> {
    const out = new Map<string, RaceEvent[]>();
    for (const e of events) {
        const list = out.get(e.raceId);
        if (list) list.push(e);
        else out.set(e.raceId, [e]);
    }
    return out;
}
