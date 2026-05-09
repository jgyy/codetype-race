import {
    BatchGetCommand,
    QueryCommand,
    type DynamoDBDocumentClient,
    type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

const BATCH_GET_CHUNK = 100;

/**
 * Phase 16.6 — issue a Query against GSI1 (KEYS_ONLY projection) and
 * follow it up with a BatchGet on the base table to hydrate the
 * non-key attributes the caller actually consumes.
 *
 * BatchGet does NOT preserve input order (DynamoDB explicitly batches
 * across partitions), so we restore the Query ordering by joining on
 * (PK, SK).
 *
 * Works correctly even if the GSI projection is still ALL during a
 * migration window — the BatchGet just returns the same item again,
 * and downstream callers see the same shape they always did.
 *
 * If the BatchGet returns no item for a (PK, SK) pair (item deleted
 * between Query and BatchGet), that pair is dropped from the output
 * — same observable semantics as a stale cache miss in any
 * eventually-consistent read pattern.
 */
export async function queryGsiThenHydrate<T = Record<string, unknown>>(
    client: DynamoDBDocumentClient,
    table: string,
    queryInput: QueryCommandInput,
    /**
     * Optional post-hydration predicate. Use this for attribute-based
     * filters that previously lived in `FilterExpression` on the GSI
     * Query — those won't work against a KEYS_ONLY projection because
     * the attribute simply isn't there. Applied after BatchGet, so it
     * sees the full base-table item.
     */
    filter?: (item: T) => boolean,
): Promise<T[]> {
    const r = await client.send(new QueryCommand(queryInput));
    const items = r.Items ?? [];
    if (items.length === 0) return [];

    // Transparent during the projection-rebuild window: if items already
    // have non-key attributes (i.e., projection is still ALL), skip the
    // BatchGet and return them directly. Once the GSI rebuilds to
    // KEYS_ONLY, items will have exactly 4 keys (PK, SK, GSI1PK, GSI1SK)
    // and the BatchGet will fire.
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
                RequestItems: {
                    [table]: { Keys: chunk },
                },
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
