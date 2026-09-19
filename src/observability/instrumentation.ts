import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";

export const telemetrySdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [new PgInstrumentation()]
});

telemetrySdk.start();

const shutdown = async (): Promise<void> => {
  await telemetrySdk.shutdown();
};

process.once("SIGTERM", () => {
  void shutdown().catch((error) => {
    console.error("OpenTelemetry shutdown failed", error);
  });
});

process.once("SIGINT", () => {
  void shutdown().catch((error) => {
    console.error("OpenTelemetry shutdown failed", error);
  });
});
