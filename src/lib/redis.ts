import { Redis } from "ioredis";

export interface RedisClient {
  raw: Redis;
  /** Readiness probe: throws if Redis is unreachable. */
  ping: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Redis client (`STACK`: sessions, rate limits, cache, queue). Connects lazily
 * so the process boots before Redis is ready.
 */
export function createRedis(
  redisUrl: string,
  onError?: (error: Error) => void
): RedisClient {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5000),
  });

  // Without a listener ioredis prints "Unhandled error event" and can crash.
  client.on("error", (error: Error) => {
    onError?.(error);
  });

  return {
    raw: client,
    ping: async () => {
      if (client.status === "wait") {
        await client.connect();
      }
      const pong = await client.ping();
      if (pong !== "PONG") {
        throw new Error("Redis ping failed");
      }
    },
    disconnect: () => {
      client.disconnect();
    },
  };
}
