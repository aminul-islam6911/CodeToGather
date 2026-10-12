import postgres from "postgres";

export interface Db {
  /** Readiness probe: throws if the primary database is unreachable. */
  ping: () => Promise<void>;
  end: () => Promise<void>;
}

/**
 * Postgres client (`DATA`). Lazily connects on first query, so the process can
 * boot and serve liveness before the database is reachable.
 */
export function createDb(databaseUrl: string): Db {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });

  return {
    ping: async () => {
      await sql`select 1`;
    },
    end: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
