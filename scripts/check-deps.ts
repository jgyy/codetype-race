#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Rule = {
    packageName: string;
    rootDir: string;
    forbiddenPatterns: RegExp[];
};

const repoRoot = new URL("..", import.meta.url).pathname;

const rules: Rule[] = [
    {
        packageName: "@codetype/domain",
        rootDir: join(repoRoot, "domain/src"),
        forbiddenPatterns: [
            /@aws-sdk\//,
            /aws-cdk-lib/,
            /aws-lambda/,
            /@opentelemetry\//,
        ],
    },
    {
        packageName: "@codetype/app",
        rootDir: join(repoRoot, "app/src"),
        forbiddenPatterns: [/@aws-sdk\//, /aws-cdk-lib/, /@opentelemetry\//],
    },
];

function* walk(dir: string): Generator<string> {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const name of entries) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (full.endsWith(".ts") || full.endsWith(".tsx")) yield full;
    }
}

let violations = 0;

for (const rule of rules) {
    for (const file of walk(rule.rootDir)) {
        const text = readFileSync(file, "utf8");
        for (const pat of rule.forbiddenPatterns) {
            if (pat.test(text)) {
                violations++;
                console.error(
                    `[check-deps] ${rule.packageName}: forbidden import ${pat} in ${file}`,
                );
            }
        }
    }
}

if (violations > 0) {
    console.error(`\n[check-deps] ${violations} violation(s) found.`);
    process.exit(1);
}
console.log("[check-deps] OK — domain/app layers are clean.");
