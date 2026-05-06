#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { CodetypeStack } from "../lib/codetype-stack.js";

const app = new cdk.App();
new CodetypeStack(app, "CodetypeStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1",
  },
});
