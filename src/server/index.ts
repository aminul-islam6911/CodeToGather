import { createDb } from "../lib/db.js";
import { getEnv } from "../lib/env.js";
import { createLogger } from "../lib/logger.js";
import { createRedis } from "../lib/redis.js";
import { initSentry } from "../lib/sentry.js";
import { startTracing } from "../lib/tracing.js";

/**
 * Process entry point (`DEPLOY`). Fails fast on invalid config, boots the HTTP
 * server, and drains connections on SIGTERM/SIGINT.
 */
async function main(): Promise<void> {
  const env = getEnv();

  // Tracing must start before the instrumented libraries are imported, so the
  // app module is loaded dynamically afterwards.
  const stopTracing = startTracing({
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceVersion: env.APP_VERSION,
  });

  initSentry({
    dsn: env.SENTRY_DSN,
    release: env.APP_VERSION,
    environment: env.NODE_ENV,
  });

  const { buildApp } = await import("./app.js");

  const logger = createLogger(env);
  const db = createDb(env.DATABASE_URL);

  let redisErrorLogged = false;
  const redis = createRedis(env.REDIS_URL, (error) => {
    if (redisErrorLogged) {
      logger.debug({ err: error }, "redis reconnect attempt failed");
      return;
    }
    redisErrorLogged = true;
    logger.warn({ err: error }, "redis unavailable; retrying in background");
  });

  const app = await buildApp({
    env,
    logger,
    redis: redis.raw,
    readiness: { database: db.ping, redis: redis.ping },
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      await db.end();
      redis.disconnect();
      await stopTracing();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "error during shutdown");
      process.exit(1);
    }
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal startup error: ${message}\n`);
  process.exit(1);
});
