#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { CodetypeStack } from "../lib/codetype-stack.js";
import { MonitoringStack } from "../lib/monitoring-stack.js";
import { CertificateStack } from "../lib/certificate-stack.js";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1";
const env = { account, region };

const SITE_DOMAIN = "race.codephase.dev";
const HOSTED_ZONE = "codephase.dev";

const certStack = new CertificateStack(app, "CodetypeCertificateStack", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName: SITE_DOMAIN,
  hostedZoneName: HOSTED_ZONE,
});

new CodetypeStack(app, "CodetypeStack", {
  env,
  crossRegionReferences: true,
  siteDomainName: SITE_DOMAIN,
  hostedZoneName: HOSTED_ZONE,
  certificate: certStack.certificate,
});
new MonitoringStack(app, "CodetypeMonitoringStack", {
  env,
  alarmEmail: process.env.ALARM_EMAIL,
});
