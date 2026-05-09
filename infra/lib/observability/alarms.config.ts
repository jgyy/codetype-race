export type Severity = "warn" | "page";

export interface AlarmSpec {
    readonly id: string;
    readonly description: string;
    readonly severity: Severity;
    readonly group:
    | "lambda"
    | "apigw"
    | "ddb"
    | "stream"
    | "app"
    | "cost"
    | "infra";
    readonly enabled: boolean;
}

export const ALARMS: readonly AlarmSpec[] = [
    {
        id: "lambda-error-rate",
        description: "Lambda error rate >1% for 5m",
        severity: "page",
        group: "lambda",
        enabled: true,
    },
    {
        id: "lambda-throttles",
        description: "Any Lambda throttling for 5m",
        severity: "page",
        group: "lambda",
        enabled: true,
    },
    {
        id: "lambda-cold-start-p99",
        description: "Cold-start p99 >1.5s for 10m",
        severity: "warn",
        group: "lambda",
        enabled: false,
    },
    {
        id: "apigw-5xx",
        description: "API Gateway 5xx >0.5% for 10m",
        severity: "page",
        group: "apigw",
        enabled: true,
    },
    {
        id: "ddb-throttle",
        description: "DynamoDB user-error throttling for 5m",
        severity: "page",
        group: "ddb",
        enabled: true,
    },
    {
        id: "stream-iterator-age",
        description: "DDB stream iterator-age >60s for 5m",
        severity: "page",
        group: "stream",
        enabled: true,
    },
    {
        id: "ws-connections-drop",
        description: "WS connections abrupt drop >30% in 1m",
        severity: "warn",
        group: "infra",
        enabled: false,
    },
    {
        id: "outbox-pending",
        description: "Outbox pending depth >1000 for 5m",
        severity: "page",
        group: "app",
        enabled: false,
    },
    {
        id: "route-p99-latency",
        description: "Per-route p99 over budget for 3 windows",
        severity: "page",
        group: "app",
        enabled: false,
    },
    {
        id: "route-error-rate",
        description: "Per-route command error_rate >1% for 5m",
        severity: "page",
        group: "app",
        enabled: false,
    },
    {
        id: "xray-sampling-budget",
        description: "X-Ray sampled traces approaching free-tier budget",
        severity: "warn",
        group: "infra",
        enabled: false,
    },
    {
        id: "cost-watch-ddb-reads",
        description: "DDB ConsumedReadCapacityUnits up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
    {
        id: "cost-watch-ddb-writes",
        description: "DDB ConsumedWriteCapacityUnits up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
    {
        id: "cost-watch-lambda-duration",
        description: "Lambda Duration sum (GB-second proxy) up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
    {
        id: "cost-watch-apigw-requests",
        description: "API Gateway request count up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
    {
        id: "cost-watch-cloudfront-bytes",
        description: "CloudFront BytesDownloaded up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
    {
        id: "cost-watch-s3-requests",
        description: "S3 GET+PUT request count up >50% week-over-week",
        severity: "warn",
        group: "cost",
        enabled: false,
    },
] as const;

export const ALARM_IDS: readonly string[] = ALARMS.map((a) => a.id);
