import type { FastifyPluginAsync } from "fastify";

/**
 * Walking-skeleton root (`DEPLOY` M0.4). The React/VS Code-like editor shell
 * arrives in Phase 1; this proves the HTTP path works end to end.
 */
export const rootRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    void reply.type("text/html; charset=utf-8");
    return [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8">',
      "<title>CodeToGather</title></head>",
      "<body><h1>CodeToGather</h1>",
      "<p>Walking skeleton. Editor ships in Phase 1.</p>",
      `<p>Request ID: <code>${request.id}</code></p>`,
      "</body></html>",
    ].join("");
  });

  app.get("/v1/ping", async () => ({ pong: true }));
};
