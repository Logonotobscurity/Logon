import { join } from "node:path";
import { createSemanticExecutionHandler } from "../agent/semantic-execution-handler.js";
import { applyMigrations } from "../db/migrate.js";
import { createLogonPool } from "../db/pool.js";
import { ExecutionRuntime } from "./execution-runtime.js";

async function main(): Promise<void> {
  const pool = createLogonPool();
  const migrationsDir = join(process.cwd(), "db", "migrations");

  const migrationResult = await applyMigrations(pool, migrationsDir);
  console.error(
    "[logon-runtime] migrations applied=" +
      migrationResult.applied.length +
      " skipped=" +
      migrationResult.alreadyApplied.length
  );

  const runtime = new ExecutionRuntime(pool, createSemanticExecutionHandler(
    // ExecutionRuntime constructs its own service; pass a dedicated one for the handler.
    // Re-use the same pool so both share connections.
    new (await import("../kernel/postgres-execution-service.js")).PostgresExecutionService(pool)
  ));

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
  console.error("[logon-runtime] semantic agent runtime started (dispatcher + worker + approval sweeper)");
}

main().catch((error) => {
  console.error("[logon-runtime] fatal startup error", error);
  process.exit(1);
});
