#!/usr/bin/env bun
/**
 * Phase 15 / slice-4 runbook gate.
 *
 * Asserts a 1:1 mapping between alarm ids in
 * `infra/lib/observability/alarms.config.ts` and `<id>.md` files in
 * `docs/runbooks/`. New alarms without a runbook fail CI; orphan
 * runbooks (alarm removed but file lingers) also fail.
 *
 * Exits non-zero on the first violation set.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALARM_IDS } from "../infra/lib/observability/alarms.config";

const repoRoot = new URL("..", import.meta.url).pathname;
const RUNBOOK_DIR = join(repoRoot, "docs/runbooks");
const IGNORE = new Set(["README.md"]);

function listRunbookIds(): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(RUNBOOK_DIR);
    } catch {
        return [];
    }
    return entries
        .filter((name) => !IGNORE.has(name) && name.endsWith(".md"))
        .filter((name) => {
            const full = join(RUNBOOK_DIR, name);
            return statSync(full).isFile();
        })
        .map((name) => name.slice(0, -".md".length));
}

const runbooks = new Set(listRunbookIds());
const alarms = new Set(ALARM_IDS);

const missing = [...alarms].filter((id) => !runbooks.has(id));
const orphan = [...runbooks].filter((id) => !alarms.has(id));

let violations = 0;
for (const id of missing) {
    violations++;
    console.error(
        `[check-runbooks] missing runbook for alarm "${id}" — create docs/runbooks/${id}.md`,
    );
}
for (const id of orphan) {
    violations++;
    console.error(
        `[check-runbooks] orphan runbook docs/runbooks/${id}.md — no matching alarm in alarms.config.ts`,
    );
}

if (violations > 0) {
    console.error(`\n[check-runbooks] ${violations} violation(s) found.`);
    process.exit(1);
}
console.log(
    `[check-runbooks] OK — ${alarms.size} alarms ↔ ${runbooks.size} runbooks.`,
);
