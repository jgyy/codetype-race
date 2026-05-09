#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;

const SCAN_ROOTS = [
    join(repoRoot, "lambdas/http"),
    join(repoRoot, "lambdas/src"),
    join(repoRoot, "adapters-aws/src"),
    join(repoRoot, "app/src"),
    join(repoRoot, "domain/src"),
    join(repoRoot, "shared/src"),
];

const FORBIDDEN = [
    { name: "Math.random()", re: /\bMath\.random\s*\(/ },
    { name: "Date.now()", re: /\bDate\.now\s*\(/ },
    { name: "crypto.randomUUID()", re: /\bcrypto\.randomUUID\s*\(/ },
    { name: "randomUUID()", re: /(^|[^.\w])randomUUID\s*\(/ },
    { name: "new Date()", re: /\bnew\s+Date\s*\(\s*\)/ },
];

const SUPPRESS_RE = /\/\/\s*snapstart-safe(?::|$)/;

interface Violation {
    file: string;
    line: number;
    col: number;
    name: string;
    text: string;
}

function* walk(dir: string): Generator<string> {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
            continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            yield* walk(full);
        } else if (
            (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
            !entry.endsWith(".test.ts") &&
            !entry.endsWith(".test.tsx")
        ) {
            yield full;
        }
    }
}

function isInsideFunctionBody(source: string, offset: number): boolean {
    const stack: ("fn" | "block")[] = [];
    let i = 0;
    while (i < offset && i < source.length) {
        const ch = source[i];
        if (ch === "/" && source[i + 1] === "/") {
            while (i < source.length && source[i] !== "\n") i++;
            continue;
        }
        if (ch === "/" && source[i + 1] === "*") {
            i += 2;
            while (
                i < source.length - 1 &&
                !(source[i] === "*" && source[i + 1] === "/")
            )
                i++;
            i += 2;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            const q = ch;
            i++;
            while (i < source.length && source[i] !== q) {
                if (source[i] === "\\") i += 2;
                else i++;
            }
            i++;
            continue;
        }
        if (ch === "{") {
            const tail = source
                .slice(Math.max(0, i - 200), i)
                .replace(/\s+/g, " ")
                .trimEnd();
            const isObjectLiteral = /[=,:([]\s*$/.test(tail) || /\breturn\s*$/.test(tail);
            const isClassLike =
                /\b(class|interface|enum|namespace|module)\b[^()]*$/.test(tail);
            const isControlFlow =
                /\b(if|for|while|switch)\s*\([^)]*\)\s*$/.test(tail) ||
                /\b(else|try|finally|do)\s*$/.test(tail) ||
                /\bcatch\s*\([^)]*\)\s*$/.test(tail);
            const isBareBlock = /[};]\s*$/.test(tail);
            const isBlock =
                isObjectLiteral || isClassLike || isControlFlow || isBareBlock;
            stack.push(isBlock ? "block" : "fn");
            i++;
            continue;
        }
        if (ch === "}") {
            stack.pop();
            i++;
            continue;
        }
        i++;
    }
    return stack.includes("fn");
}

function lineColOf(source: string, offset: number): { line: number; col: number } {
    let line = 1;
    let col = 1;
    for (let i = 0; i < offset; i++) {
        if (source[i] === "\n") {
            line++;
            col = 1;
        } else {
            col++;
        }
    }
    return { line, col };
}

function scanFile(file: string): Violation[] {
    const source = readFileSync(file, "utf8");
    const violations: Violation[] = [];
    for (const { name, re } of FORBIDDEN) {
        const global = new RegExp(re.source, "g");
        let m: RegExpExecArray | null;
        while ((m = global.exec(source))) {
            if (isInsideFunctionBody(source, m.index)) continue;
            const lineStart = source.lastIndexOf("\n", m.index) + 1;
            const lineEnd = source.indexOf("\n", m.index);
            const lineText = source.slice(
                lineStart,
                lineEnd === -1 ? undefined : lineEnd,
            );
            if (SUPPRESS_RE.test(lineText)) continue;
            if (
                /^\s*(export\s+)?(default\s+)?(async\s+)?function\b/.test(
                    lineText,
                )
            )
                continue;
            const { line, col } = lineColOf(source, m.index);
            violations.push({ file, line, col, name, text: lineText.trim() });
        }
    }
    return violations;
}

const violations: Violation[] = [];
for (const root of SCAN_ROOTS) {
    for (const f of walk(root)) {
        violations.push(...scanFile(f));
    }
}

if (violations.length === 0) {
    console.log("ok snapstart-safe: no init-time non-determinism in scanned modules");
    process.exit(0);
}

console.error("FAIL snapstart-safe: init-time non-determinism detected\n");
console.error(
    "  These calls run once per execution environment, not once per\n" +
    "  invocation. Under SnapStart that produces identical values\n" +
    "  across every restored container. Move them inside a function\n" +
    "  body, or annotate the line with // snapstart-safe: <reason>.\n",
);
for (const v of violations) {
    console.error(
        `  ${relative(repoRoot, v.file)}:${v.line}:${v.col}  ${v.name}\n    ${v.text}`,
    );
}
console.error(`\n  ${violations.length} violation(s)`);
process.exit(1);
