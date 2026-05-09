import * as path from "node:path";
import { Duration } from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { OTEL_EXTERNALS } from "./otel-layer.js";

export interface LambdaFactoryOptions {
    readonly lambdaDir: string;
    readonly depsLockFilePath: string;
    readonly table: ddb.ITable;
    readonly otelLayer: lambda.ILayerVersion;
    readonly deployEnv: string;
    /**
     * OTLP/HTTP endpoint base URL (no trailing /v1/traces). When set, the
     * layer's bootstrap wires a BatchSpanProcessor and the sampler defaults
     * flip from `always_off` to `parentbased_traceidratio`. When undefined
     * (default), the SDK stays hot-but-silent — same as Phase 15 / slice-1.
     */
    readonly otlpEndpoint?: string;
    /**
     * Head-sample ratio in [0..1]. Only consulted when `otlpEndpoint` is
     * set. Defaults to 0.05 per the Phase 15 spec sampling table.
     */
    readonly sampleRatio?: number;
}

export class LambdaFactory {
    constructor(
        private readonly scope: Construct,
        private readonly opts: LambdaFactoryOptions,
    ) { }

    create(
        id: string,
        entry: string,
        extraEnv: Record<string, string> = {},
        overrides: Partial<nodejs.NodejsFunctionProps> = {},
    ): nodejs.NodejsFunction {
        const {
            lambdaDir,
            depsLockFilePath,
            table,
            otelLayer,
            deployEnv,
            otlpEndpoint,
            sampleRatio = 0.05,
        } = this.opts;

        const otelEnv: Record<string, string> = otlpEndpoint
            ? {
                  OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
                  OTEL_TRACES_SAMPLER_ARG: String(sampleRatio),
                  OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint,
              }
            : { OTEL_TRACES_SAMPLER: "always_off" };

        return new nodejs.NodejsFunction(this.scope, id, {
            entry: path.join(lambdaDir, entry),
            projectRoot: lambdaDir,
            depsLockFilePath,
            runtime: lambda.Runtime.NODEJS_20_X,
            architecture: lambda.Architecture.ARM_64,
            memorySize: 256,
            timeout: Duration.seconds(10),
            layers: [otelLayer],
            bundling: {
                format: nodejs.OutputFormat.ESM,
                mainFields: ["module", "main"],
                target: "node20",
                externalModules: [...OTEL_EXTERNALS],
            },
            environment: {
                TABLE_NAME: table.tableName,
                NODE_OPTIONS: "--require /opt/bootstrap.js",
                ...otelEnv,
                OTEL_SERVICE_NAME: `codetype-${id}`,
                DEPLOY_ENV: deployEnv,
                ...extraEnv,
            },
            ...overrides,
        });
    }
}
