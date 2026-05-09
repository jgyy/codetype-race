"use strict";

try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const {
        getNodeAutoInstrumentations,
    } = require("@opentelemetry/auto-instrumentations-node");
    const {
        AWSXRayPropagator,
    } = require("@opentelemetry/propagator-aws-xray");
    const {
        AWSXRayIdGenerator,
    } = require("@opentelemetry/id-generator-aws-xray");
    const { Resource } = require("@opentelemetry/resources");
    const {
        SemanticResourceAttributes,
    } = require("@opentelemetry/semantic-conventions");
    const api = require("@opentelemetry/api");

    const serviceName = process.env.OTEL_SERVICE_NAME || "codetype-unknown";
    const env = process.env.DEPLOY_ENV || "dev";
    const version = process.env.SERVICE_VERSION || "unknown";
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    let traceExporter;
    let spanProcessor;
    if (otlpEndpoint) {
        const {
            OTLPTraceExporter,
        } = require("@opentelemetry/exporter-trace-otlp-http");
        const {
            BatchSpanProcessor,
        } = require("@opentelemetry/sdk-trace-base");
        traceExporter = new OTLPTraceExporter({
            url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
        });
        spanProcessor = new BatchSpanProcessor(traceExporter, {
            maxQueueSize: 512,
            maxExportBatchSize: 64,
            scheduledDelayMillis: 250,
            exportTimeoutMillis: 2000,
        });
    }

    const sdk = new NodeSDK({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
            [SemanticResourceAttributes.SERVICE_VERSION]: version,
            [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env,
        }),
        idGenerator: new AWSXRayIdGenerator(),
        textMapPropagator: new AWSXRayPropagator(),
        traceExporter,
        spanProcessor,
        instrumentations: [
            getNodeAutoInstrumentations({
                "@opentelemetry/instrumentation-fs": { enabled: false },
                "@opentelemetry/instrumentation-dns": { enabled: false },
                "@opentelemetry/instrumentation-net": { enabled: false },
            }),
        ],
    });

    sdk.start();

    global.__codetypeOtel = {
        api,
        sampler: process.env.OTEL_TRACES_SAMPLER,
        exporting: Boolean(otlpEndpoint),
    };

    console.log(
        JSON.stringify({
            msg: "otel.bootstrap.ok",
            service: serviceName,
            env,
            sampler: process.env.OTEL_TRACES_SAMPLER || "default",
            exporting: Boolean(otlpEndpoint),
        }),
    );

    const shutdown = () => sdk.shutdown().catch(() => { });
    process.once("SIGTERM", shutdown);
    process.once("beforeExit", shutdown);
} catch (err) {
    console.log(
        JSON.stringify({
            msg: "otel.bootstrap.failed",
            err: err && err.message ? err.message : String(err),
        }),
    );
}
