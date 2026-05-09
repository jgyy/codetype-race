import {
    BatchGetCommand,
    QueryCommand,
    type DynamoDBDocumentClient,
    type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

const BATCH_GET_CHUNK = 100;

/**
 * Phase 16.6 — Query against GSI1 (KEYS_ONLY) followed by BatchGet on
 * the base table to hydrate the consumed attributes. Preserves Query
 * order (BatchGet doesn't). Drops items deleted between Query and
 * BatchGet (eventual-consistency stale-cache semantics).
 */
export async function queryGsiThenHydrate<T = Record<string, unknown>>(
    client: DynamoDBDocumentClient,
    table: string,
    queryInput: QueryCommandInput,
    filter?: (item: T) => boolean,
): Promise<T[]> {
    const r = await client.send(new QueryCommand(queryInput));
    const items = r.Items ?? [];
    if (items.length === 0) return [];

    const sample = items[0];
    const sampleKeys = Object.keys(sample).filter(
        (k) => k === "PK" || k === "SK" || k === "GSI1PK" || k === "GSI1SK",
    ).length;
    if (Object.keys(sample).length > sampleKeys) {
        const out = items as T[];
        return filter ? out.filter(filter) : out;
    }

    const keys = items.map((i) => ({ PK: i.PK, SK: i.SK }));

    const hydrated = new Map<string, T>();
    for (let i = 0; i < keys.length; i += BATCH_GET_CHUNK) {
        const chunk = keys.slice(i, i + BATCH_GET_CHUNK);
        const resp = (await client.send(
            new BatchGetCommand({
                RequestItems: { [table]: { Keys: chunk } },
            }),
        )) as { Responses?: Record<string, unknown[]> } | undefined;
        for (const item of ((resp?.Responses?.[table] ?? []) as T[])) {
            const key = `${(item as { PK: unknown }).PK}|${(item as { SK: unknown }).SK}`;
            hydrated.set(key, item);
        }
    }

    const out: T[] = [];
    for (const k of keys) {
        const found = hydrated.get(`${k.PK}|${k.SK}`);
        if (found && (!filter || filter(found))) out.push(found);
    }
    return out;
}
