import { z } from "zod";

/**
 * Environment schema (`CFG`). Every variable the app reads is declared here.
 * Validation is fail-fast at boot and only ever names the offending variable,
 * never its value.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_VERSION: z.string().min(1).default("dev"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),

  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    ),
  SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment source. Throws an Error that lists the
 * missing/invalid variable names only. Values are never included.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(root)")),
    ];
    throw new Error(`Invalid or missing environment variables: ${names.join(", ")}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Lazily load and cache the process environment. Called once at boot. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
