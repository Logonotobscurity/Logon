import { Pool, type PoolConfig } from "pg";

export interface LogonPoolOptions {
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMs?: number;
}

/**
 * Hardened PostgreSQL pool defaults for LOG_ON services.
 * Callers must still pass LOGON_DATABASE_URL / DATABASE_URL.
 */
export function createLogonPool(
  options: LogonPoolOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Pool {
  const connectionString =
    options.connectionString ?? env.LOGON_DATABASE_URL ?? env.DATABASE_URL;

  if (!connectionString || !connectionString.trim()) {
    throw new Error("LOGON_DATABASE_URL or DATABASE_URL is required");
  }

  const config: PoolConfig = {
    connectionString,
    max: options.max ?? Number(env.LOGON_PG_POOL_MAX ?? 10),
    idleTimeoutMillis: options.idleTimeoutMillis ?? Number(env.LOGON_PG_IDLE_MS ?? 30_000),
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? Number(env.LOGON_PG_CONNECT_MS ?? 5_000),
    allowExitOnIdle: true
  };

  const pool = new Pool(config);
  const statementTimeoutMs =
    options.statementTimeoutMs ?? Number(env.LOGON_PG_STATEMENT_TIMEOUT_MS ?? 0);

  if (statementTimeoutMs > 0) {
    pool.on("connect", (client) => {
      void client.query("set statement_timeout = " + statementTimeoutMs);
    });
  }

  pool.on("error", (error) => {
    console.error("[logon-pg] idle client error", error);
  });

  return pool;
}
