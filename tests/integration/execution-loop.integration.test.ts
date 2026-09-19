import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PostgresExecutionService } from "../../src/kernel/postgres-execution-service.js";
import { ExecutionOutboxPublisher } from "../../src/queue/execution-outbox-publisher.js";
import { createControlledExecutionHandler } from "../../src/runtime/controlled-execution-handler.js";
import type { ExecutionRequest } from "../../src/kernel/types.js";

const databaseUrl = process.env.LOGON_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.LOGON_REDIS_URL ?? process.env.REDIS_URL;

const servicesAvailable = Boolean(databaseUrl && redisUrl);

async function applyMigrations(pool: Pool): Promise<void> {
  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = [
    "0001_kernel.sql",
    "0002_kernel_constraints.sql",
    "0003_execution_outbox.sql",
    "0004_approval_expiry_index.sql"
  ];
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await pool.query(sql);
  }
}

function request(executionId: string, requiresApproval = false): ExecutionRequest {
  return {
    identity: {
      executionId,
      tenantId: "tenant-integration",
      actorId: "actor-integration",
      agentId: "agent-integration",
      agentVersion: "0.1.0"
    },
    objective: "Integration loop verification",
    context: {},
    policySet: ["baseline"],
    requestedTools: [],
    requiresApproval,
    evidenceRequired: true,
    createdAt: new Date().toISOString()
  };
}

describe.skipIf(!servicesAvailable)("execution loop integration", () => {
  it("starts an execution, publishes outbox, and advances INTAKE → CONTEXT", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const service = new PostgresExecutionService(pool);
    const publisher = new ExecutionOutboxPublisher(pool);
    const handler = createControlledExecutionHandler(service, "integration-worker");

    try {
      await applyMigrations(pool);

      const executionId = "ex-int-" + randomUUID();
      const started = await service.start(request(executionId, false));
      expect(started.reused).toBe(false);
      expect(started.event.status).toBe("INTAKE");

      const published = await publisher.publishOnce();
      expect(published.claimed).toBeGreaterThanOrEqual(1);
      expect(published.dispatched).toBeGreaterThanOrEqual(1);
      expect(published.failed).toBe(0);

      await handler(executionId, {} as never);

      const latest = await service.store.withTransaction((client) =>
        service.store.latestEvent(client, executionId)
      );
      expect(latest?.status).toBe("CONTEXT");
    } finally {
      await publisher.close();
      await pool.end();
    }
  }, 60_000);

  it("holds dispatch until approval is granted", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const service = new PostgresExecutionService(pool);
    const publisher = new ExecutionOutboxPublisher(pool);

    try {
      await applyMigrations(pool);

      const executionId = "ex-apr-" + randomUUID();
      const started = await service.start(request(executionId, true));
      expect(started.event.status).toBe("APPROVAL");

      const before = await publisher.publishOnce();
      // No PENDING dispatch should exist while approval is outstanding.
      expect(before.dispatched).toBe(0);

      const approval = await service.store.withTransaction((client) =>
        service.store.getApproval(client, executionId)
      );
      expect(approval?.status).toBe("PENDING");
      if (!approval) throw new Error("expected approval row");

      await service.decideApproval({
        approvalId: approval.approvalId,
        executionId,
        status: "APPROVED",
        decidedBy: "integration-reviewer",
        decidedAt: new Date().toISOString(),
        reason: "Integration approval"
      });

      const after = await publisher.publishOnce();
      expect(after.claimed).toBeGreaterThanOrEqual(1);
      expect(after.dispatched).toBeGreaterThanOrEqual(1);

      const latest = await service.store.withTransaction((client) =>
        service.store.latestEvent(client, executionId)
      );
      expect(latest?.status).toBe("EXECUTION");
    } finally {
      await publisher.close();
      await pool.end();
    }
  }, 60_000);
});

describe("execution loop integration prerequisites", () => {
  it("documents required services when unavailable", () => {
    if (servicesAvailable) {
      expect(databaseUrl).toBeTruthy();
      expect(redisUrl).toBeTruthy();
      return;
    }

    expect(servicesAvailable).toBe(false);
    // Set LOGON_DATABASE_URL and LOGON_REDIS_URL (or DATABASE_URL / REDIS_URL)
    // then run: npm run test:integration
  });
});
