/**
 * Phase 15 / slice-4 — single source of truth for the alarm catalogue.
 *
 * Every entry MUST have a matching runbook at `docs/runbooks/<id>.md`.
 * `scripts/check-runbooks.ts` enforces this in CI; new alarms without a
 * runbook fail the build.
 *
 * Alarms whose underlying metric is not yet emitting (e.g. anything
 * keyed off `app.command.duration_ms` from slice-2) are still listed
 * here so the runbooks exist before the alarm goes live; the
 * observability stack chooses which to instantiate via `enabled`.
 */

export type Severity = "warn" | "page";

export interface AlarmSpec {
    /** Stable id used as the runbook filename and CloudFormation logical id. */
    readonly id: string;
    /** Short human description used in runbook headers and SNS messages. */
    readonly description: string;
    readonly severity: Severity;
    /**
     * Group lets us instantiate alarms in batches as their feeding metrics
     * come online across phases.
     */
    readonly group:
        | "lambda" // already-emitting AWS/Lambda metrics
        | "apigw" // AWS/ApiGateway / AWS/ApiGatewayV2
        | "ddb" // AWS/DynamoDB
        | "stream" // AWS/Lambda iterator-age on stream consumers
        | "app" // app-level metrics from slice-2 (sampler currently off)
        | "infra"; // OTel / X-Ray internal health
    /**
     * Whether the observability stack should instantiate this alarm today.
     * Some entries are catalogued for runbook coverage but only become live
     * once exporters are wired in slice-5.
     */
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
        enabled: false, // needs cold-start metric emitter
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
        enabled: false, // needs gauge from slice-5
    },
    {
        id: "outbox-pending",
        description: "Outbox pending depth >1000 for 5m",
        severity: "page",
        group: "app",
        enabled: false, // needs app gauge
    },
    {
        id: "route-p99-latency",
        description: "Per-route p99 over budget for 3 windows",
        severity: "page",
        group: "app",
        enabled: false, // needs histogram exports
    },
    {
        id: "route-error-rate",
        description: "Per-route command error_rate >1% for 5m",
        severity: "page",
        group: "app",
        enabled: false, // needs counter exports
    },
    {
        id: "xray-sampling-budget",
        description: "X-Ray sampled traces approaching free-tier budget",
        severity: "warn",
        group: "infra",
        enabled: false, // needs slice-5 exporter live
    },
] as const;

export const ALARM_IDS: readonly string[] = ALARMS.map((a) => a.id);
