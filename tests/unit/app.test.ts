import { describe, expect, it } from "vitest";
import { parseEnv, type Env } from "../../src/lib/env.js";
import { createMetrics } from "../../src/lib/metrics.js";
import { buildApp } from "../../src/server/app.js";

function testEnv(): Env {
  return parseEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: "postgres://user:pass@localhost:5432/codetogather",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "x".repeat(40),
  });
}

describe("app (SEC, OBS, DEPLOY)", () => {
  it("serves liveness and correlates the request id", async () => {
    const app = await buildApp({ env: testEnv() });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
    await app.close();
  });

  it("honors an inbound request id header", async () => {
    const app = await buildApp({ env: testEnv() });
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "abc-123" },
    });
    expect(res.headers["x-request-id"]).toBe("abc-123");
    await app.close();
  });

  it("reports ready when dependencies respond", async () => {
    const app = await buildApp({
      env: testEnv(),
      readiness: { database: async () => {}, redis: async () => {} },
    });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
    await app.close();
  });

  it("reports unavailable without leaking dependency error details", async () => {
    const app = await buildApp({
      env: testEnv(),
      readiness: {
        database: async () => {
          throw new Error("connection string is super-secret");
        },
      },
    });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { status: string; failed: string[] };
    expect(body.status).toBe("unavailable");
    expect(body.failed).toEqual(["database"]);
    expect(res.body).not.toContain("super-secret");
    await app.close();
  });

  it("exposes golden-signal metrics", async () => {
    const app = await buildApp({ env: testEnv(), metrics: createMetrics("test") });
    await app.inject({ method: "GET", url: "/healthz" });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("http_requests_total");
    expect(res.body).toContain("http_request_duration_seconds");
    await app.close();
  });

  it("returns the single error shape for unknown routes", async () => {
    const app = await buildApp({ env: testEnv() });
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });

  it("hides internal errors behind a 500 envelope", async () => {
    const app = await buildApp({ env: testEnv() });
    app.get("/boom", async () => {
      throw new Error("kaboom internal detail");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json() as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal Server Error");
    expect(res.body).not.toContain("kaboom");
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });
});
