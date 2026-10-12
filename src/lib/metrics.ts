import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export interface AppMetrics {
  registry: Registry;
  httpRequestsTotal: Counter<"method" | "route" | "status">;
  httpRequestDuration: Histogram<"method" | "route" | "status">;
}

/**
 * Golden-signal metrics (`OBS`): request rate, error rate, and latency.
 * Labels are bounded (method / route template / status) - never user IDs or raw URLs.
 */
export function createMetrics(appVersion: string): AppMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: "codetogather", version: appVersion });
  collectDefaultMetrics({ register: registry });

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests by method, route template and status code.",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds by method, route template and status code.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, httpRequestsTotal, httpRequestDuration };
}
