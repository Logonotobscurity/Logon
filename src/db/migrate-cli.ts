import { join } from "node:path";
import { applyMigrations } from "./migrate.js";
import { createLogonPool } from "./pool.js";

async function main(): Promise<void> {
  const pool = createLogonPool();
  try {
    const result = await applyMigrations(pool, join(process.cwd(), "db", "migrations"));
    console.log(
      JSON.stringify(
        {
          applied: result.applied,
          alreadyApplied: result.alreadyApplied
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[logon-migrate] failed", error);
  process.exit(1);
});
