import { Pool } from "pg";
import { PostgresExecutionService } from "../kernel/postgres-execution-service.js";
import { createControlledExecutionHandler } from "./controlled-execution-handler.js";
import { ExecutionRuntime } from "./execution-runtime.js";

function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.LOGON_DATABASE_URL ?? env.DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error("LOGON_DATABASE_URL or DATABASE_URL is required to start the execution runtime");
  }
  return url;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const service = new PostgresExecutionService(pool);
  const runtime = new ExecutionRuntime(pool, createControlledExecutionHandler(service));

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.error(`[logon-runtime] received ${signal}, shutting down`);
    try {
      await runtime.stop();
      await pool.end();
      console.error("[logon-runtime] shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[logon-runtime] shutdown failed", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  runtime.start();
  console.error("[logon-runtime] execution runtime started (dispatcher + worker)");
}

main().catch((error) => {
  console.error("[logon-runtime] fatal startup error", error);
  process.exit(1);
});
