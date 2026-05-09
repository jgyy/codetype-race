#!/usr/bin/env bun
/**
 * Phase 16.11 — guard against accidentally re-introducing remote fonts.
 *
 * The codebase deliberately uses only system-font stacks (configured in
 * tailwind.config.ts) so first paint never blocks on a font download.
 * Reintroducing next/font, fonts.googleapis.com, or @font-face would
 * regress FCP — this check fails CI if any of those land.
 *
 * To lift the guard for a deliberate reintroduction (e.g. distinctive
 * branding), edit FORBIDDEN below and document the FCP trade-off in the
 * PR description.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SCAN_ROOTS = [
    join(__dirname, "..", "src"),
    join(__dirname, "..", "..", "web", "src"),
    // also check global CSS / tailwind config
    join(__dirname, ".."),
];

interface Rule {
    name: string;
    re: RegExp;
    skipFiles?: RegExp;
}

const SELF = /check-no-remote-fonts\.ts/;
const FORBIDDEN: Rule[] = [
    { name: "fonts.googleapis.com", re: /fonts\.googleapis\.com/, skipFiles: SELF },
    { name: "fonts.gstatic.com", re: /fonts\.gstatic\.com/, skipFiles: SELF },
    { name: "next/font import", re: /from\s+["']next\/font/, skipFiles: SELF },
    { name: "@font-face declaration", re: /@font-face\b/, skipFiles: SELF },
];

interface Hit {
    file: string;
    line: number;
    rule: string;
    text: string;
}

function* walk(dir: string): Generator<string> {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const e of entries) {
        if (
            e === "node_modules" ||
            e === ".next" ||
            e === "out" ||
            e.startsWith(".")
        )
            continue;
        const full = join(dir, e);
        const st = statSync(full);
        if (st.isDirectory()) {
            yield* walk(full);
        } else if (/\.(ts|tsx|js|jsx|css|html)$/.test(e)) {
            yield full;
        }
    }
}

const hits: Hit[] = [];
for (const root of SCAN_ROOTS) {
    for (const f of walk(root)) {
        const src = readFileSync(f, "utf8");
        const lines = src.split("\n");
        for (const rule of FORBIDDEN) {
            if (rule.skipFiles && rule.skipFiles.test(f)) continue;
            for (let i = 0; i < lines.length; i++) {
                if (rule.re.test(lines[i])) {
                    hits.push({
                        file: f,
                        line: i + 1,
                        rule: rule.name,
                        text: lines[i].trim(),
                    });
                }
            }
        }
    }
}

if (hits.length === 0) {
    console.log("ok no-remote-fonts: system-font stacks only");
    process.exit(0);
}

console.error("FAIL no-remote-fonts: remote-font references detected\n");
for (const h of hits) {
    const rel = relative(process.cwd(), h.file);
    console.error(`  ${rel}:${h.line}  [${h.rule}]\n    ${h.text}`);
}
console.error(
    "\nThe codebase pins system fonts for FCP. To deliberately add a font,\n" +
        "  edit web/scripts/check-no-remote-fonts.ts (lift the rule + document\n" +
        "  the FCP trade-off in the PR).",
);
process.exit(1);
