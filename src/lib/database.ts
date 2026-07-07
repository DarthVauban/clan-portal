import "server-only";
import { Pool } from "pg";

declare global {
  var clanPortalDatabasePool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
  });
}

export function getDatabasePool() {
  if (!globalThis.clanPortalDatabasePool) globalThis.clanPortalDatabasePool = createPool();
  return globalThis.clanPortalDatabasePool;
}
