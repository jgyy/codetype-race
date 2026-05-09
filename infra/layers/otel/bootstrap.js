// Phase 15 / slice-1 bootstrap.
//
// Loaded via NODE_OPTIONS=--require /opt/otel/bootstrap.js BEFORE any handler
// module evaluates. In this slice the SDK is constructed but the trace sampler
// is forced to always_off and no exporters are wired, so initialisation is
// hot but emits nothing. Slice-3 wires the OTLP/X-Ray exporter and slice-4
// flips sampling on.
//
// Failure here MUST NOT take down the handler — wrap in try/catch and surface
// a single log line per cold start.
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

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: version,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env,
    }),
    idGenerator: new AWSXRayIdGenerator(),
    textMapPropagator: new AWSXRayPropagator(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy / irrelevant default instrumentations. We only need
        // AWS SDK + http here. Re-enable in slice-3 once exporters exist.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Expose the global tracer/api so lambdas/src/otel.ts can grab it.
  global.__codetypeOtel = { api, sampler: process.env.OTEL_TRACES_SAMPLER };

  // One-shot init log (per cold start) — useful for confirming layer load.
  // Stays as console.log because the structured logger is in lambdas/, not here.
  console.log(
    JSON.stringify({
      msg: "otel.bootstrap.ok",
      service: serviceName,
      env,
      sampler: process.env.OTEL_TRACES_SAMPLER || "default",
    }),
  );

  // Graceful shutdown so spans flush on Lambda freeze (no-op in slice-1).
  const shutdown = () => sdk.shutdown().catch(() => {});
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
