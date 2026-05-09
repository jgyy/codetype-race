const NAMESPACE = "Codetype";

export type MetricUnit =
    | "Count"
    | "Milliseconds"
    | "Seconds"
    | "Bytes"
    | "Percent";

interface MetricEntry {
    name: string;
    unit: MetricUnit;
    value: number;
    dimensions?: Record<string, string>;
}

export function emit(entry: MetricEntry): void {
    const dims = entry.dimensions ?? {};
    const dimensionKeys = Object.keys(dims);
    const line = {
        _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
                {
                    Namespace: NAMESPACE,
                    Dimensions: dimensionKeys.length > 0 ? [dimensionKeys] : [[]],
                    Metrics: [{ Name: entry.name, Unit: entry.unit }],
                },
            ],
        },
        ...dims,
        [entry.name]: entry.value,
    };
    console.log(JSON.stringify(line));
}

export const metrics = {
    raceFinished: (durationMs: number) => {
        emit({ name: "RaceFinished", unit: "Count", value: 1 });
        emit({ name: "RaceDurationMs", unit: "Milliseconds", value: durationMs });
    },
    antiCheatFlag: (code: string) =>
        emit({
            name: "AntiCheatFlag",
            unit: "Count",
            value: 1,
            dimensions: { signal: code },
        }),
    chatRateLimited: () =>
        emit({ name: "ChatRateLimited", unit: "Count", value: 1 }),
    wsReconnect: () => emit({ name: "WsReconnect", unit: "Count", value: 1 }),
};
