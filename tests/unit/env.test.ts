import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/lib/env.js";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/codetogather",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "x".repeat(40),
};

describe("parseEnv (CFG)", () => {
  it("applies defaults and normalizes values", () => {
    const env = parseEnv({ ...valid, CORS_ORIGINS: "https://a.example, https://b.example" });
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("fails fast naming the missing variable", () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = valid;
    expect(() => parseEnv(withoutDb)).toThrowError(/DATABASE_URL/);
  });

  it("never prints the offending secret value", () => {
    const secret = "too-short-secret";
    expect(() => parseEnv({ ...valid, SESSION_SECRET: secret })).toThrowError(
      /SESSION_SECRET/
    );
    try {
      parseEnv({ ...valid, SESSION_SECRET: secret });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
    }
  });

  it("treats an empty optional variable as unset", () => {
    const env = parseEnv({ ...valid, SENTRY_DSN: "" });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("names all invalid variables at once", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrowError(
      /DATABASE_URL, REDIS_URL, SESSION_SECRET/
    );
  });
});
