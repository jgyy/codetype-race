// Embedded Metric Format (EMF). CloudWatch parses these JSON log lines
// out of the function's log group automatically — no PutMetricData
// API calls, no extra IAM, no extra dependencies.
//
// Spec: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

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

/**
 * Emit a single metric line. CloudWatch picks it up if the log group is
 * in a region where EMF is enabled (every commercial region today).
 */
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
