import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/lib/env.js";
import { buildApp } from "../../src/server/app.js";

const env = parseEnv({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://user:pass@localhost:5432/codetogather",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "x".repeat(40),
});

/** Minimal Redis double: reports a count above the configured limit. */
function overLimitRedis(): Redis {
  return {
    incr: async () => 999,
    expire: async () => 1,
  } as unknown as Redis;
}

describe("redis-backed rate limiting (SEC)", () => {
  it("returns 429 with the error envelope once the limit is exceeded", async () => {
    const app = await buildApp({ env, redis: overLimitRedis() });
    const res = await app.inject({ method: "GET", url: "/v1/ping" });
    expect(res.statusCode).toBe(429);
    const body = res.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });

  it("never rate-limits health probes", async () => {
    const app = await buildApp({ env, redis: overLimitRedis() });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
