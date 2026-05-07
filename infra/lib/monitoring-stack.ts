import {
  Duration,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface MonitoringStackProps extends StackProps {
  /** Optional email subscription for the alarm SNS topic. */
  alarmEmail?: string;
}

/**
 * Operational dashboard + alarms. Deployed as a separate stack so it can
 * be destroyed/recreated without touching application infrastructure.
 *
 * Note: alarm thresholds are starting points — tune after a few weeks of
 * baseline data. The Lighthouse / preview-stack pieces of Phase 08 are
 * deferred (require a per-PR CDK preview pipeline).
 */
export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps = {}) {
    super(scope, id, props);

    const topic = new sns.Topic(this, "AlarmTopic", {
      displayName: "codetype-race alarms",
    });
    if (props.alarmEmail) {
      new sns.Subscription(this, "AlarmEmail", {
        topic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: props.alarmEmail,
      });
    }

    // Lambda namespace: errors per route, p95 latency, throttles. We
    // dimension by FunctionName which the application stack derives
    // from the construct id (CreateRoom, JoinRoom, …).
    const lambdaErrorRate = new cw.MathExpression({
      expression: "(errors / invocations) * 100",
      usingMetrics: {
        errors: new cw.Metric({
          namespace: "AWS/Lambda",
          metricName: "Errors",
          statistic: "Sum",
          period: Duration.minutes(5),
        }),
        invocations: new cw.Metric({
          namespace: "AWS/Lambda",
          metricName: "Invocations",
          statistic: "Sum",
          period: Duration.minutes(5),
        }),
      },
      label: "Lambda error rate (%)",
      period: Duration.minutes(5),
    });

    const lambdaThrottles = new cw.Metric({
      namespace: "AWS/Lambda",
      metricName: "Throttles",
      statistic: "Sum",
      period: Duration.minutes(1),
    });

    const lambdaLatencyP95 = new cw.Metric({
      namespace: "AWS/Lambda",
      metricName: "Duration",
      statistic: "p95",
      period: Duration.minutes(5),
    });

    // Application metrics emitted via EMF from the middleware's
    // structured-log path. The `Codetype` namespace is set by
    // `lambdas/src/metrics.ts`.
    const ns = "Codetype";
    const antiCheatFlags = new cw.Metric({
      namespace: ns,
      metricName: "AntiCheatFlag",
      statistic: "Sum",
      period: Duration.hours(1),
    });
    const racesFinished = new cw.Metric({
      namespace: ns,
      metricName: "RaceFinished",
      statistic: "Sum",
      period: Duration.hours(1),
    });
    const chatRateLimited = new cw.Metric({
      namespace: ns,
      metricName: "ChatRateLimited",
      statistic: "Sum",
      period: Duration.hours(1),
    });
    const wsReconnect = new cw.Metric({
      namespace: ns,
      metricName: "WsReconnect",
      statistic: "Sum",
      period: Duration.hours(1),
    });

    const dashboard = new cw.Dashboard(this, "Dashboard", {
      dashboardName: "codetype-race",
    });
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Lambda error rate (5m, %)",
        left: [lambdaErrorRate],
        width: 12,
      }),
      new cw.GraphWidget({
        title: "Lambda p95 latency (ms)",
        left: [lambdaLatencyP95],
        width: 12,
      }),
    );
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Lambda throttles (1m)",
        left: [lambdaThrottles],
        width: 12,
      }),
      new cw.GraphWidget({
        title: "Race finishes (1h)",
        left: [racesFinished],
        width: 12,
      }),
    );
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Anti-cheat flags (1h)",
        left: [antiCheatFlags],
        width: 8,
      }),
      new cw.GraphWidget({
        title: "Chat rate-limit (1h)",
        left: [chatRateLimited],
        width: 8,
      }),
      new cw.GraphWidget({
        title: "WS reconnects (1h)",
        left: [wsReconnect],
        width: 8,
      }),
    );

    // Alarms. Wire each to the SNS topic so the email subscription
    // fires once it's confirmed.
    const errorAlarm = new cw.Alarm(this, "ErrorRateAlarm", {
      metric: lambdaErrorRate,
      threshold: 2,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "Lambda error rate >2% over 5 minutes",
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    const throttleAlarm = new cw.Alarm(this, "ThrottleAlarm", {
      metric: lambdaThrottles,
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "Any Lambda throttle in the last minute",
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    for (const a of [errorAlarm, throttleAlarm]) {
      a.addAlarmAction(new cwActions.SnsAction(topic));
    }
  }
}
