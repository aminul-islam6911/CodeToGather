import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { Env } from "../lib/env.js";
import { createMetrics, type AppMetrics } from "../lib/metrics.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { createRateLimitHook } from "./plugins/rate-limit.js";
import { healthRoutes, type ReadinessChecks } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";

export interface BuildAppOptions {
  env: Env;
  logger?: Logger;
  readiness?: ReadinessChecks;
  redis?: Redis;
  metrics?: AppMetrics;
}

/**
 * Compose the Fastify application (`SEC`, `OBS`, `DEPLOY`). Kept free of
 * process-level concerns (listen, signals) so it can be injected in tests.
 */
export async function buildApp(options: BuildAppOptions) {
  const metrics = options.metrics ?? createMetrics(options.env.APP_VERSION);

  const app = Fastify({
    ...(options.logger ? { loggerInstance: options.logger } : {}),
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && header.length > 0 ? header : randomUUID();
    },
    trustProxy: true,
    // We emit our own bounded completion log (method/route/status/duration) so
    // the default request logging, which includes the client IP, is never used.
    // NOTE: deprecated in favor of logController in Fastify 6; migrate then.
    disableRequestLogging: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? "unknown";
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };
    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDuration.observe(labels, reply.elapsedTime / 1000);

    // request.log carries the request id binding; fields stay bounded (OBS).
    request.log.info(
      {
        method: request.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed"
    );
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: options.env.CORS_ORIGINS.length > 0 ? options.env.CORS_ORIGINS : false,
    credentials: true,
  });

  if (options.redis) {
    app.addHook(
      "onRequest",
      createRateLimitHook(options.redis, { max: 300, windowSeconds: 60 })
    );
  }

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(healthRoutes, {
    readiness: options.readiness ?? {},
    registry: metrics.registry,
  });
  await app.register(rootRoutes);

  return app;
}
