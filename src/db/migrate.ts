import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";

export interface AppliedMigration {
  version: string;
  name: string;
  appliedAt: string;
}

export interface MigrationRunResult {
  applied: string[];
  alreadyApplied: string[];
}

const SCHEMA_TABLE = "logon_schema_migrations";

export async function ensureMigrationTable(client: Pick<PoolClient, "query">): Promise<void> {
  await client.query(
    "create table if not exists " +
      SCHEMA_TABLE +
      " (" +
      "version text primary key," +
      "name text not null," +
      "checksum text not null," +
      "applied_at timestamptz not null default now()" +
      ")"
  );
}

export async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

export function migrationVersion(filename: string): string {
  const match = filename.match(/^(\d{4})_/);
  if (!match) throw new Error("Invalid migration filename: " + filename);
  return match[1];
}

export async function getAppliedMigrations(
  client: Pick<PoolClient, "query">
): Promise<Map<string, AppliedMigration>> {
  await ensureMigrationTable(client);
  const result = await client.query(
    "select version, name, applied_at from " + SCHEMA_TABLE + " order by version asc"
  );
  const map = new Map<string, AppliedMigration>();
  for (const row of result.rows) {
    map.set(String(row.version), {
      version: String(row.version),
      name: String(row.name),
      appliedAt: new Date(row.applied_at).toISOString()
    });
  }
  return map;
}

export async function applyMigrations(
  pool: Pool,
  migrationsDir: string
): Promise<MigrationRunResult> {
  const files = await listMigrationFiles(migrationsDir);
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureMigrationTable(client);
    const existing = await getAppliedMigrations(client);

    for (const file of files) {
      const version = migrationVersion(file);
      if (existing.has(version)) {
        alreadyApplied.push(file);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");
      const checksum = simpleChecksum(sql);
      await client.query(sql);
      await client.query(
        "insert into " +
          SCHEMA_TABLE +
          " (version, name, checksum) values ($1, $2, $3)",
        [version, file, checksum]
      );
      applied.push(file);
    }

    await client.query("COMMIT");
    return { applied, alreadyApplied };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // preserve original
    }
    throw error;
  } finally {
    client.release();
  }
}

function simpleChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
