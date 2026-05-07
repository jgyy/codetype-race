#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { CodetypeStack } from "../lib/codetype-stack.js";
import { MonitoringStack } from "../lib/monitoring-stack.js";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1",
};
new CodetypeStack(app, "CodetypeStack", { env });
new MonitoringStack(app, "CodetypeMonitoringStack", {
  env,
  alarmEmail: process.env.ALARM_EMAIL,
});
