import * as Sentry from "@sentry/node";

export interface SentryOptions {
  dsn: string | undefined;
  release: string;
  environment: string;
}

/** Initialize Sentry error tracking (`OBS`). No-op when no DSN is configured. */
export function initSentry(options: SentryOptions): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,
    tracesSampleRate: 0.1,
  });
  return true;
}

export function captureError(error: unknown): void {
  Sentry.captureException(error);
}
