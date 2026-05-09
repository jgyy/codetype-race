import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as xray from "aws-cdk-lib/aws-xray";
import { Construct } from "constructs";
import { ALARMS, type AlarmSpec } from "./observability/alarms.config.js";
import {
    DASHBOARDS,
    type DashboardSpec,
    type DashboardWidgetSpec,
} from "./observability/dashboards.config.js";

export interface ObservabilityStackProps extends StackProps {
    readonly alarmEmail?: string;
    readonly xraySampleRate?: number;
}

export class ObservabilityStack extends Stack {
    readonly oncallTopic: sns.ITopic;

    constructor(
        scope: Construct,
        id: string,
        props: ObservabilityStackProps = {},
    ) {
        super(scope, id, props);

        this.oncallTopic = new sns.Topic(this, "OncallTopic", {
            displayName: "codetype oncall pagers (Phase 15)",
        });
        if (props.alarmEmail) {
            new sns.Subscription(this, "OncallEmail", {
                topic: this.oncallTopic,
                protocol: sns.SubscriptionProtocol.EMAIL,
                endpoint: props.alarmEmail,
            });
        }

        this.createSamplingRule(props.xraySampleRate ?? 0.05);
        this.instantiateAlarms();
        for (const spec of DASHBOARDS) this.renderDashboard(spec);
    }

    private createSamplingRule(rate: number): void {
        new xray.CfnSamplingRule(this, "DefaultSamplingRule", {
            samplingRule: {
                ruleName: "codetype-default",
                priority: 9000,
                fixedRate: rate,
                reservoirSize: 1,
                serviceName: "*",
                serviceType: "*",
                host: "*",
                httpMethod: "*",
                urlPath: "*",
                resourceArn: "*",
                version: 1,
            },
        });
    }

    private instantiateAlarms(): void {
        for (const spec of ALARMS.filter((a: AlarmSpec) => a.enabled)) {
            const alarm = this.buildAlarmFor(spec);
            if (!alarm) continue;
            alarm.addAlarmAction(new cwActions.SnsAction(this.oncallTopic));
        }
    }

    private buildAlarmFor(spec: AlarmSpec): cw.Alarm | undefined {
        switch (spec.id) {
            case "lambda-error-rate":
                return new cw.Alarm(this, alarmLogicalId(spec.id), {
                    alarmName: spec.id,
                    alarmDescription: spec.description,
                    metric: new cw.MathExpression({
                        expression: "(errors / invocations) * 100",
                        usingMetrics: {
                            errors: lambdaMetric("Errors", "Sum"),
                            invocations: lambdaMetric("Invocations", "Sum"),
                        },
                        label: "Lambda error rate (%)",
                        period: Duration.minutes(5),
                    }),
                    threshold: 1,
                    evaluationPeriods: 1,
                    comparisonOperator:
                        cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
                });
            case "lambda-throttles":
                return new cw.Alarm(this, alarmLogicalId(spec.id), {
                    alarmName: spec.id,
                    alarmDescription: spec.description,
                    metric: lambdaMetric("Throttles", "Sum", Duration.minutes(5)),
                    threshold: 0,
                    evaluationPeriods: 1,
                    comparisonOperator:
                        cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
                });
            case "apigw-5xx":
                return new cw.Alarm(this, alarmLogicalId(spec.id), {
                    alarmName: spec.id,
                    alarmDescription: spec.description,
                    metric: new cw.Metric({
                        namespace: "AWS/ApiGateway",
                        metricName: "5XXError",
                        statistic: "Average",
                        period: Duration.minutes(5),
                    }),
                    threshold: 0.005,
                    evaluationPeriods: 2,
                    comparisonOperator:
                        cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
                });
            case "ddb-throttle":
                return new cw.Alarm(this, alarmLogicalId(spec.id), {
                    alarmName: spec.id,
                    alarmDescription: spec.description,
                    metric: new cw.Metric({
                        namespace: "AWS/DynamoDB",
                        metricName: "UserErrors",
                        statistic: "Sum",
                        period: Duration.minutes(5),
                    }),
                    threshold: 0,
                    evaluationPeriods: 1,
                    comparisonOperator:
                        cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
                });
            case "stream-iterator-age":
                return new cw.Alarm(this, alarmLogicalId(spec.id), {
                    alarmName: spec.id,
                    alarmDescription: spec.description,
                    metric: lambdaMetric(
                        "IteratorAge",
                        "Maximum",
                        Duration.minutes(5),
                    ),
                    threshold: 60_000,
                    evaluationPeriods: 1,
                    comparisonOperator:
                        cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    treatMissingData: cw.TreatMissingData.NOT_BREACHING,
                });
            default:
                return undefined;
        }
    }

    private renderDashboard(spec: DashboardSpec): void {
        const dashboard = new cw.Dashboard(this, `Dashboard-${spec.id}`, {
            dashboardName: `codetype-${spec.id}`,
        });
        dashboard.addWidgets(...spec.widgets.map(buildWidget));
    }
}

function alarmLogicalId(id: string): string {
    return id
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
}

function lambdaMetric(
    metricName: string,
    statistic: string,
    period = Duration.minutes(5),
): cw.Metric {
    return new cw.Metric({
        namespace: "AWS/Lambda",
        metricName,
        statistic,
        period,
    });
}

function buildWidget(spec: DashboardWidgetSpec): cw.IWidget {
    const metric = new cw.Metric({
        namespace: spec.namespace,
        metricName: spec.metricName,
        statistic: spec.statistic ?? "Sum",
        period: Duration.minutes(5),
        label: spec.label,
    });
    return new cw.GraphWidget({
        title: spec.title,
        width: spec.width,
        height: spec.height,
        left: [metric],
    });
}
