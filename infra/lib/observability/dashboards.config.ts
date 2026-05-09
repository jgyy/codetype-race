export interface DashboardWidgetSpec {
    readonly title: string;
    readonly width: number;
    readonly height: number;
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
        description:
            "Daily cost-driving metrics across DDB, Lambda, API Gateway, CloudFront, and S3. Pair with the cost-watch-* alarms which fire on >50% week-over-week growth.",
        widgets: [
            {
                title: "DDB consumed read units (Sum)",
                source: "aws",
                namespace: "AWS/DynamoDB",
                metricName: "ConsumedReadCapacityUnits",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "DDB consumed write units (Sum)",
                source: "aws",
                namespace: "AWS/DynamoDB",
                metricName: "ConsumedWriteCapacityUnits",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "Lambda invocations (Sum)",
                source: "aws",
                namespace: "AWS/Lambda",
                metricName: "Invocations",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "Lambda duration (Sum, ms — proxy for GB-seconds)",
                source: "aws",
                namespace: "AWS/Lambda",
                metricName: "Duration",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "API Gateway request count",
                source: "aws",
                namespace: "AWS/ApiGateway",
                metricName: "Count",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "CloudFront bytes downloaded",
                source: "aws",
                namespace: "AWS/CloudFront",
                metricName: "BytesDownloaded",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "S3 GET requests",
                source: "aws",
                namespace: "AWS/S3",
                metricName: "GetRequests",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
            {
                title: "S3 PUT requests",
                source: "aws",
                namespace: "AWS/S3",
                metricName: "PutRequests",
                statistic: "Sum",
                width: 12,
                height: 6,
            },
        ],
    },
] as const;
