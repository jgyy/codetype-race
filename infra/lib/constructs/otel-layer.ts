import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetHashType, RemovalPolicy } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OTEL_LAYER_DIR = path.resolve(__dirname, "../../layers/otel");

export const OTEL_EXTERNALS = [
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/propagator-aws-xray",
    "@opentelemetry/id-generator-aws-xray",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
] as const;

export class OtelLayer extends Construct {
    readonly version: lambda.LayerVersion;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.version = new lambda.LayerVersion(this, "Version", {
            description:
                "OpenTelemetry SDK + auto-instrumentations (Phase 15 / slice-1: sampler=always_off)",
            compatibleArchitectures: [
                lambda.Architecture.ARM_64,
                lambda.Architecture.X86_64,
            ],
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            removalPolicy: RemovalPolicy.DESTROY,
            code: lambda.Code.fromAsset(OTEL_LAYER_DIR, {
                assetHashType: AssetHashType.OUTPUT,
                bundling: {
                    image: lambda.Runtime.NODEJS_20_X.bundlingImage,
                    local: { tryBundle: localBundle },
                    command: [
                        "bash",
                        "-c",
                        [
                            "mkdir -p /asset-output/nodejs",
                            "cp /asset-input/package.json /asset-output/nodejs/package.json",
                            "cp /asset-input/bootstrap.js /asset-output/bootstrap.js",
                            "cd /asset-output/nodejs && npm install --omit=dev --no-audit --no-fund",
                        ].join(" && "),
                    ],
                },
            }),
        });
    }
}

function localBundle(outputDir: string): boolean {
    const probe = spawnSync("npm", ["--version"], { stdio: "ignore" });
    if (probe.status !== 0) return false;

    const nodejsDir = path.join(outputDir, "nodejs");
    fs.mkdirSync(nodejsDir, { recursive: true });
    fs.copyFileSync(
        path.join(OTEL_LAYER_DIR, "package.json"),
        path.join(nodejsDir, "package.json"),
    );
    fs.copyFileSync(
        path.join(OTEL_LAYER_DIR, "bootstrap.js"),
        path.join(outputDir, "bootstrap.js"),
    );
    const install = spawnSync(
        "npm",
        ["install", "--omit=dev", "--no-audit", "--no-fund"],
        { cwd: nodejsDir, stdio: "inherit" },
    );
    return install.status === 0;
}
