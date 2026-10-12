import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface TracingOptions {
  /** OTLP HTTP base endpoint, e.g. http://localhost:4318. Unset disables tracing. */
  endpoint: string | undefined;
  serviceVersion: string;
}

/**
 * Start OpenTelemetry tracing (`OBS`). Must run before the instrumented
 * libraries (Fastify, http) are imported, so callers load the app dynamically
 * after this returns. No-op when no endpoint is configured.
 */
export function startTracing(options: TracingOptions): () => Promise<void> {
  if (!options.endpoint) {
    return async () => {};
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "codetogather",
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${options.endpoint.replace(/\/$/, "")}/v1/traces`,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  return async () => {
    await sdk.shutdown();
  };
}
