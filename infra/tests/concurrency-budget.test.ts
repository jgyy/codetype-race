import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
    RESERVED_CONCURRENCY,
    type ConcurrencyTier,
} from "../lib/constructs/lambda-factory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACK_PATH = path.resolve(__dirname, "../lib/codetype-stack.ts");

function classify(id: string, entry: string): ConcurrencyTier {
    if (entry.startsWith("ws/")) return "ws";
    if (entry.startsWith("stream/")) return "stream";
    if (entry.startsWith("cron/")) return "cron";
    if (/Room|Race/.test(id)) return "http_hot";
    if (
        /Snippet|Leaderboard|Daily|User|Profile|Friend|Feed|Guild|Tourn|Season|Presence|Replay/.test(
            id,
        )
    )
        return "http_warm";
    return "http_default";
}

function extractFnCalls(source: string): Array<{ id: string; entry: string }> {
    const re = /fn\(\s*"([A-Za-z0-9]+)"\s*,\s*"([^"]+)"/g;
    const out: Array<{ id: string; entry: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
        out.push({ id: m[1], entry: m[2] });
    }
    return out;
}

describe("concurrency budget (Phase 16.3)", () => {
    const source = readFileSync(STACK_PATH, "utf8");
    const calls = extractFnCalls(source);

    test("stack defines a non-trivial number of lambda entries", () => {
        expect(calls.length).toBeGreaterThanOrEqual(40);
    });

    test("total reserved concurrency stays under 900", () => {
        const total = calls.reduce(
            (acc, c) => acc + RESERVED_CONCURRENCY[classify(c.id, c.entry)],
            0,
        );
        expect(total).toBeLessThanOrEqual(900);
    });

    test("each tier has at least one handler classified into it", () => {
        const tiers = new Set(calls.map((c) => classify(c.id, c.entry)));
        for (const tier of [
            "http_hot",
            "http_warm",
            "ws",
            "stream",
            "cron",
        ] as ConcurrencyTier[]) {
            expect(tiers.has(tier)).toBe(true);
        }
    });

    test("WS, stream, and cron entries land in their path-prefix tier", () => {
        for (const c of calls) {
            const tier = classify(c.id, c.entry);
            if (c.entry.startsWith("ws/")) expect(tier).toBe("ws");
            if (c.entry.startsWith("stream/")) expect(tier).toBe("stream");
            if (c.entry.startsWith("cron/")) expect(tier).toBe("cron");
        }
    });
});
