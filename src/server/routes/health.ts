import type { FastifyPluginAsync } from "fastify";
import type { Registry } from "prom-client";

export interface ReadinessChecks {
  database?: () => Promise<void>;
  redis?: () => Promise<void>;
}

export interface HealthRoutesOptions {
  readiness: ReadinessChecks;
  registry: Registry;
}

type NamedCheck = [string, () => Promise<void>];

/**
 * Liveness + readiness + metrics (`DEPLOY`, `OBS`).
 * Readiness fails only on core dependencies (DB, Redis), never optional ones,
 * and reports dependency names - never error details.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  app,
  options
) => {
  app.get("/healthz", { logLevel: "warn" }, async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    const checks = Object.entries(options.readiness).filter(
      (entry): entry is NamedCheck => typeof entry[1] === "function"
    );

    const results = await Promise.all(
      checks.map(async (entry): Promise<readonly [string, boolean]> => {
        const [name, check] = entry;
        try {
          await check();
          return [name, true];
        } catch {
          return [name, false];
        }
      })
    );

    const failed = results
      .filter((result) => !result[1])
      .map((result) => result[0]);

    if (failed.length > 0) {
      return reply
        .status(503)
        .send({ status: "unavailable", failed });
    }
    return { status: "ready" };
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", options.registry.contentType);
    return options.registry.metrics();
  });
};
