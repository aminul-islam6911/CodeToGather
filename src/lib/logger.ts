import pino, { type Logger } from "pino";
import type { Env } from "./env.js";

/**
 * Structured JSON logger (`OBS`). Request IDs are attached by the Fastify
 * request logger; secrets and credentials are redacted, never emitted.
 */
export function createLogger(
  env: Pick<Env, "NODE_ENV" | "LOG_LEVEL" | "APP_VERSION">
): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { app: "codetogather", version: env.APP_VERSION },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
        "password",
        "token",
        "secret",
        "session",
        "*.password",
        "*.token",
        "*.secret",
      ],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
}
