// Phase 15 / slice-8 — sensitive-field sanitiser.
//
// Strips Authorization / Cookie / token-shaped fields from any object
// before it reaches the structured logger or a span attribute. The OTel
// auto-instrumentations capture HTTP request headers and AWS SDK request
// payloads by default — without this the same secrets would land in
// CloudWatch Logs and X-Ray segments.
//
// Pure: no I/O, no globals. Returns a NEW object — never mutates input.

const SENSITIVE_KEY_RX =
    /^(authorization|cookie|set-cookie|x-api-key|x-amz-security-token|password|secret|token)$/i;

const JWT_RX = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BEARER_RX = /^Bearer\s+\S+$/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

export interface SanitiseOptions {
    /** Additional case-insensitive keys to redact. */
    readonly extraKeys?: readonly string[];
    /** Maximum recursion depth — guards against pathological cyclic input. */
    readonly maxDepth?: number;
}

export function sanitise<T>(value: T, opts: SanitiseOptions = {}): T {
    const extra = opts.extraKeys
        ? new Set(opts.extraKeys.map((k) => k.toLowerCase()))
        : undefined;
    const maxDepth = opts.maxDepth ?? MAX_DEPTH;
    return walk(value, 0, maxDepth, extra) as T;
}

function isSensitiveKey(key: string, extra?: Set<string>): boolean {
    if (SENSITIVE_KEY_RX.test(key)) return true;
    if (extra && extra.has(key.toLowerCase())) return true;
    return false;
}

function looksLikeSecretString(s: string): boolean {
    if (s.length === 0) return false;
    if (JWT_RX.test(s)) return true;
    if (BEARER_RX.test(s)) return true;
    return false;
}

function walk(
    value: unknown,
    depth: number,
    maxDepth: number,
    extra: Set<string> | undefined,
): unknown {
    if (depth > maxDepth) return REDACTED;
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
        return looksLikeSecretString(value) ? REDACTED : value;
    }
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) {
        return value.map((v) => walk(v, depth + 1, maxDepth, extra));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isSensitiveKey(k, extra)) {
            out[k] = REDACTED;
            continue;
        }
        // DDB Item payloads: redact the entire `Item` value when nested
        // inside an auto-instrumentation span attribute object.
        if ((k === "Item" || k === "Items") && depth >= 1) {
            out[k] = REDACTED;
            continue;
        }
        out[k] = walk(v, depth + 1, maxDepth, extra);
    }
    return out;
}
