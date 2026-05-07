export type Severity = "low" | "medium" | "high";

export interface CheatSignal {
    code: string;
    severity: Severity;
    detail: string;
}

export interface KeystrokeSample {
    t: number;
    char: string;
}

export interface RunStats {
    snippetLength: number;
    durationMs: number;
    charsTyped: number;
    meanIntervalMs?: number;
    stddevIntervalMs?: number;
    maxIntervalGapMs?: number;
    maxPosAdvance?: number;
    totalKeystrokes?: number;
}

const DEFAULT_THRESHOLDS = {
    maxWpm: 250,
    minMsPerChar: 25,
    minStddevMs: 8,
    minKeystrokesForVariance: 50,
    maxPosAdvance: 5,
};

export type Thresholds = typeof DEFAULT_THRESHOLDS;

function computeWpm(charsTyped: number, durationMs: number): number {
    if (durationMs <= 0) return 0;
    return charsTyped / 5 / (durationMs / 60_000);
}

export function evaluateStats(
    stats: RunStats,
    thresholds: Partial<Thresholds> = {},
): CheatSignal[] {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const out: CheatSignal[] = [];

    const wpm = computeWpm(stats.charsTyped, stats.durationMs);
    if (wpm > t.maxWpm) {
        out.push({
            code: "WPM_TOO_HIGH",
            severity: "high",
            detail: `${wpm.toFixed(0)} wpm > ${t.maxWpm}`,
        });
    }

    if (stats.snippetLength > 0) {
        const msPerChar = stats.durationMs / stats.snippetLength;
        if (msPerChar < t.minMsPerChar) {
            out.push({
                code: "SUB_HUMAN_INTERVAL",
                severity: "high",
                detail: `${msPerChar.toFixed(1)}ms/char < ${t.minMsPerChar}`,
            });
        }
    }

    if (
        stats.stddevIntervalMs !== undefined &&
        (stats.totalKeystrokes ?? 0) > t.minKeystrokesForVariance &&
        stats.stddevIntervalMs < t.minStddevMs
    ) {
        out.push({
            code: "LOW_VARIANCE",
            severity: "medium",
            detail: `stddev ${stats.stddevIntervalMs.toFixed(1)}ms < ${t.minStddevMs}`,
        });
    }

    if (
        stats.maxPosAdvance !== undefined &&
        stats.maxPosAdvance > t.maxPosAdvance
    ) {
        out.push({
            code: "PASTE_SUSPECTED",
            severity: "high",
            detail: `single-frame advance ${stats.maxPosAdvance}`,
        });
    }

    return out;
}

export function statsFromSamples(
    samples: KeystrokeSample[],
    snippetLength: number,
    durationMs?: number,
): RunStats {
    const charsTyped = samples.filter((s) => s.char.length > 0).length;
    const intervals: number[] = [];
    let maxGap = 0;
    for (let i = 1; i < samples.length; i++) {
        const dt = samples[i]!.t - samples[i - 1]!.t;
        intervals.push(dt);
        if (dt > maxGap) maxGap = dt;
    }
    const mean =
        intervals.length === 0
            ? 0
            : intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
        intervals.length === 0
            ? 0
            : intervals.reduce((a, b) => a + (b - mean) ** 2, 0) /
            intervals.length;
    const stddev = Math.sqrt(variance);

    let maxPosAdvance = 0;
    let burst = 1;
    for (let i = 1; i < samples.length; i++) {
        if (samples[i]!.t - samples[i - 1]!.t < 50) {
            burst += 1;
            if (burst > maxPosAdvance) maxPosAdvance = burst;
        } else {
            burst = 1;
        }
    }

    return {
        snippetLength,
        durationMs:
            durationMs ??
            (samples.length > 0
                ? samples[samples.length - 1]!.t - samples[0]!.t
                : 0),
        charsTyped,
        meanIntervalMs: mean,
        stddevIntervalMs: stddev,
        maxIntervalGapMs: maxGap,
        maxPosAdvance,
        totalKeystrokes: samples.length,
    };
}

export function evaluateRun(
    samples: KeystrokeSample[],
    snippetLength: number,
    durationMs?: number,
    thresholds: Partial<Thresholds> = {},
): CheatSignal[] {
    return evaluateStats(statsFromSamples(samples, snippetLength, durationMs), thresholds);
}

export function maxSeverity(signals: CheatSignal[]): Severity | null {
    if (signals.length === 0) return null;
    if (signals.some((s) => s.severity === "high")) return "high";
    if (signals.some((s) => s.severity === "medium")) return "medium";
    return "low";
}

export function isFlagged(signals: CheatSignal[]): boolean {
    return signals.some((s) => s.severity === "high");
}
