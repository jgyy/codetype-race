import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RemovalPolicy } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OTEL_LAYER_DIR = path.resolve(__dirname, "../../layers/otel");

/**
 * Phase 15 / slice-1 — packages of the OTel SDK that MUST stay external in
 * handler bundles so they load from the layer at /opt/nodejs/node_modules.
 * Bundling them inline produces two SDK instances and breaks the global
 * tracer registry shared by the --require preload.
 */
export const OTEL_EXTERNALS = [
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/propagator-aws-xray",
    "@opentelemetry/id-generator-aws-xray",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
] as const;

/**
 * Lambda layer carrying the OpenTelemetry SDK + auto-instrumentations.
 * Built from `infra/layers/otel/` via local bundling (bun) with a Docker
 * fallback (npm). The output layout is the canonical Lambda layer shape:
 *
 *   /opt/bootstrap.js
 *   /opt/nodejs/node_modules/@opentelemetry/...
 *
 * Handlers preload the bootstrap via `NODE_OPTIONS=--require /opt/bootstrap.js`
 * which the LambdaFactory wires automatically.
 */
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

/**
 * Local bundling fallback used by `cdk synth` on dev machines that don't
 * have Docker available. Returns false if `bun` isn't on PATH so CDK then
 * falls through to the Docker `command`.
 */
function localBundle(outputDir: string): boolean {
    // Inline requires: this function runs at synth time, not handler time,
    // and CDK's local-bundling contract is sync.
    const { spawnSync } =
        require("node:child_process") as typeof import("node:child_process");
    const fs = require("node:fs") as typeof import("node:fs");
    const p = require("node:path") as typeof import("node:path");

    const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
    if (probe.status !== 0) return false;

    const nodejsDir = p.join(outputDir, "nodejs");
    fs.mkdirSync(nodejsDir, { recursive: true });
    fs.copyFileSync(
        p.join(OTEL_LAYER_DIR, "package.json"),
        p.join(nodejsDir, "package.json"),
    );
    fs.copyFileSync(
        p.join(OTEL_LAYER_DIR, "bootstrap.js"),
        p.join(outputDir, "bootstrap.js"),
    );
    const install = spawnSync("bun", ["install", "--production"], {
        cwd: nodejsDir,
        stdio: "inherit",
    });
    return install.status === 0;
}
