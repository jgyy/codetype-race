#!/usr/bin/env bun
import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

export const PAGE_TOTAL_BUDGET_BYTES = 180 * 1024;
export const PER_CHUNK_BUDGET_BYTES = 250 * 1024;
const TARGET_ROUTE = "/page";

export interface BudgetReport {
    total: number;
    overChunks: Array<{ name: string; size: number }>;
    ok: boolean;
}

export function evaluateBudget(sizes: Map<string, number>): BudgetReport {
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    const overChunks: Array<{ name: string; size: number }> = [];
    for (const [name, size] of sizes) {
        if (size > PER_CHUNK_BUDGET_BYTES) overChunks.push({ name, size });
    }
    const ok = total <= PAGE_TOTAL_BUDGET_BYTES && overChunks.length === 0;
    return { total, overChunks, ok };
}

interface RouteManifest {
    rootMainFiles?: string[];
    polyfillFiles?: string[];
}

function readRouteManifest(manifestPath: string): RouteManifest {
    let raw: string;
    try {
        raw = readFileSync(manifestPath, "utf8");
    } catch {
        console.error(
            `check-bundle: ${path.relative(process.cwd(), manifestPath)} not found.\n` +
                `  Run \`bun run build\` first (the manifest is a build artifact).`,
        );
        process.exit(2);
    }
    return JSON.parse(raw) as RouteManifest;
}

function gzipSize(filePath: string): number {
    return gzipSync(readFileSync(filePath)).length;
}

function fmtKB(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} kB`;
}

function main(): void {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const NEXT_DIR = path.resolve(__dirname, "..", ".next");
    // Next 16 / Turbopack: per-route manifest replaces the legacy
    // top-level app-build-manifest.json. TARGET_ROUTE "/page" maps to
    // .next/server/app/page/build-manifest.json (the home route).
    const MANIFEST_PATH = path.join(
        NEXT_DIR,
        "server",
        "app",
        TARGET_ROUTE.replace(/^\//, ""),
        "build-manifest.json",
    );

    const manifest = readRouteManifest(MANIFEST_PATH);
    const homeChunks = [
        ...(manifest.rootMainFiles ?? []),
        ...(manifest.polyfillFiles ?? []),
    ];
    if (homeChunks.length === 0) {
        console.error(
            `check-bundle: ${TARGET_ROUTE} manifest has no rootMainFiles/polyfillFiles.`,
        );
        process.exit(2);
    }

    const jsChunks = Array.from(
        new Set(homeChunks.filter((c) => c.endsWith(".js"))),
    );

    const sizes = new Map<string, number>();
    for (const chunk of jsChunks) {
        const full = path.join(NEXT_DIR, chunk);
        try {
            statSync(full);
        } catch {
            console.error(`check-bundle: missing chunk ${chunk}`);
            process.exit(2);
        }
        sizes.set(chunk, gzipSize(full));
    }

    const report = evaluateBudget(sizes);

    console.log(
        `check-bundle: ${TARGET_ROUTE} = ${fmtKB(report.total)} gzip ` +
            `across ${jsChunks.length} chunks ` +
            `(budget ${fmtKB(PAGE_TOTAL_BUDGET_BYTES)})`,
    );
    const sorted = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, size] of sorted.slice(0, 8)) {
        console.log(`    ${fmtKB(size).padStart(9)}  ${name}`);
    }
    if (sorted.length > 8) console.log(`    … ${sorted.length - 8} smaller chunks`);

    if (report.total > PAGE_TOTAL_BUDGET_BYTES) {
        console.error(
            `\nFAIL: ${TARGET_ROUTE} initial JS ${fmtKB(report.total)} > budget ${fmtKB(PAGE_TOTAL_BUDGET_BYTES)} (over by ${fmtKB(report.total - PAGE_TOTAL_BUDGET_BYTES)})`,
        );
    }
    if (report.overChunks.length > 0) {
        console.error(
            `\nFAIL: ${report.overChunks.length} chunk(s) > ${fmtKB(PER_CHUNK_BUDGET_BYTES)}:`,
        );
        for (const c of report.overChunks) {
            console.error(`    ${fmtKB(c.size)}  ${c.name}`);
        }
    }

    if (!report.ok) {
        console.error(
            `\nIf this is genuine feature work that needs more bundle, raise the ceiling\n` +
                `  in web/scripts/check-bundle.ts in 20 kB increments and explain why\n` +
                `  in the PR description.`,
        );
        process.exit(1);
    }
    console.log("\nok bundle within budget.");
}

if (import.meta.main) main();
