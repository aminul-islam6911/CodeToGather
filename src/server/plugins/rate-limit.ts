import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { toErrorBody } from "../errors.js";

export interface RateLimitOptions {
  max: number;
  windowSeconds: number;
}

const SKIP_PREFIXES = ["/healthz", "/readyz", "/metrics"];

/**
 * Redis-backed rate limiting (`SEC`). Shared state, so it holds across
 * instances. In-memory limiters are forbidden. Health/metrics probes are exempt.
 *
 * Returned as a hook so the caller can attach it at the root scope: a hook
 * added inside an encapsulated `register` would not cover sibling routes.
 */
export function createRateLimitHook(redis: Redis, options: RateLimitOptions) {
  return async function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply | void> {
    if (SKIP_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      return;
    }

    const key = `ratelimit:${request.ip}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    reply.header("x-ratelimit-limit", options.max);
    reply.header("x-ratelimit-remaining", Math.max(0, options.max - current));

    if (current > options.max) {
      return reply
        .status(429)
        .send(toErrorBody("RATE_LIMITED", "Too many requests", request.id));
    }
  };
}
