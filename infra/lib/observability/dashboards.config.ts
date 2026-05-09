/**
 * Phase 15 / slice-4 — declarative dashboard catalogue.
 *
 * Dashboards are generated from this single config so the runtime stack
 * stays a renderer of pure data. New dashboards: add an entry here.
 */

export interface DashboardWidgetSpec {
    readonly title: string;
    readonly width: number;
    readonly height: number;
    /**
     * Metric source. `app` widgets are keyed off the OTel-emitted custom
     * namespace; `aws` widgets reuse standard AWS/* namespaces. The widget
     * factory in observability-stack.ts decides how to render each.
     */
    readonly source: "app" | "aws";
    readonly namespace: string;
    readonly metricName: string;
    readonly statistic?: "Sum" | "Average" | "Maximum" | "p50" | "p95" | "p99";
    readonly label?: string;
}

export interface DashboardSpec {
    readonly id: string;
    readonly description: string;
    readonly widgets: readonly DashboardWidgetSpec[];
}

export const DASHBOARDS: readonly DashboardSpec[] = [
    {
        id: "request-flow",
        description:
            "RED for the four critical buses (CreateRoom, JoinRoom, FinishRace, GetLeaderboard)",
        widgets: [
            {
                title: "Command rate by name",
                source: "app",
                namespace: "Codetype/App",
                metricName: "app.commands.total",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "Command duration p95",
                source: "app",
                namespace: "Codetype/App",
                metricName: "app.command.duration_ms",
                statistic: "p95",
                width: 12,
                height: 6,
            },
            {
                title: "Query rate by name",
                source: "app",
                namespace: "Codetype/App",
                metricName: "app.queries.total",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "Query duration p95",
                source: "app",
                namespace: "Codetype/App",
                metricName: "app.query.duration_ms",
                statistic: "p95",
                width: 12,
                height: 6,
            },
        ],
    },
    {
        id: "ws-infra",
        description: "WS connection counts, broadcast latency, iterator-age",
        widgets: [
            {
                title: "Lambda iterator age (broadcaster)",
                source: "aws",
                namespace: "AWS/Lambda",
                metricName: "IteratorAge",
                statistic: "Maximum",
                width: 24,
                height: 6,
            },
        ],
    },
    {
        id: "cost-watch",
        description: "DDB consumed RCU/WCU per table",
        widgets: [
            {
                title: "DDB consumed read units",
                source: "aws",
                namespace: "AWS/DynamoDB",
                metricName: "ConsumedReadCapacityUnits",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "DDB consumed write units",
                source: "aws",
                namespace: "AWS/DynamoDB",
                metricName: "ConsumedWriteCapacityUnits",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
        ],
    },
] as const;
