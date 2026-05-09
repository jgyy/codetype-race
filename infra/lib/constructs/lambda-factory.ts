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
        const { lambdaDir, depsLockFilePath, table, otelLayer, deployEnv } =
            this.opts;

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
                OTEL_TRACES_SAMPLER: "always_off",
                OTEL_SERVICE_NAME: `codetype-${id}`,
                DEPLOY_ENV: deployEnv,
                ...extraEnv,
            },
            ...overrides,
        });
    }
}
