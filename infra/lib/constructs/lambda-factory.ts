import * as path from "node:path";
import { Duration } from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { OTEL_EXTERNALS } from "./otel-layer";

export interface LambdaFactoryOptions {
    /** Directory containing handler entry files (e.g. `lambdas/`). */
    readonly lambdaDir: string;
    /** Bun lockfile colocated with handler sources. */
    readonly depsLockFilePath: string;
    /** Shared DDB table; its name is injected as TABLE_NAME. */
    readonly table: ddb.ITable;
    /** OTel layer attached to every function. */
    readonly otelLayer: lambda.ILayerVersion;
    /** Logical environment label exported as DEPLOY_ENV. */
    readonly deployEnv: string;
}

/**
 * Centralised builder for `NodejsFunction`s in the codetype stack.
 *
 * Replaces the ad-hoc closure that previously lived in `CodetypeStack`'s
 * constructor. Every Lambda gets:
 *   - ARM64 / Node 20 / 256 MB / 10 s timeout (current defaults)
 *   - The OTel layer with `NODE_OPTIONS=--require /opt/bootstrap.js`
 *   - Sampler forced off until Phase 15 / slice-4 flips it
 *   - TABLE_NAME injected so handlers don't need to thread the name
 *
 * Per-function overrides (extra env vars, larger timeout, etc.) are passed
 * through `extraEnv` and `overrides` so this stays a single chokepoint.
 */
export class LambdaFactory {
    constructor(
        private readonly scope: Construct,
        private readonly opts: LambdaFactoryOptions,
    ) {}

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
