import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PostgresExecutionService } from "../../src/kernel/postgres-execution-service.js";
import { ExecutionOutboxDispatcher } from "../../src/queue/execution-outbox-dispatcher.js";
import { ExecutionOutboxPublisher } from "../../src/queue/execution-outbox-publisher.js";
import { ExecutionWorker } from "../../src/queue/execution-worker.js";
import { createControlledExecutionHandler } from "../../src/runtime/controlled-execution-handler.js";
import { ApprovalExpiredError, ApprovalExecutionMismatchError } from "../../src/kernel/errors.js";
import type { ExecutionRequest, ExecutionStatus } from "../../src/kernel/types.js";

const databaseUrl = process.env.LOGON_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.LOGON_REDIS_URL ?? process.env.REDIS_URL;
const servicesAvailable = Boolean(databaseUrl && redisUrl);

let pool: Pool | undefined;
let bootstrapPool: Pool | undefined;
let publisher: ExecutionOutboxPublisher | undefined;
let dispatcher: ExecutionOutboxDispatcher | undefined;
let worker: ExecutionWorker | undefined;
let service: PostgresExecutionService | undefined;
let schemaName: string | undefined;

async function applyMigrations(target: Pool): Promise<void> {
  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = [
    "0001_kernel.sql",
    "0002_kernel_constraints.sql",
    "0003_execution_outbox.sql",
    "0004_approval_expiry_index.sql",
    "0005_approval_execution_integrity.sql"
  ];

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await target.query(sql);
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

async function latestStatus(executionId: string): Promise<ExecutionStatus | undefined> {
  if (!service) throw new Error("integration service not initialized");
  return service.store.withTransaction((client) =>
    service.store.latestEvent(client, executionId).then((event) => event?.status)
  );
}

async function waitForStatus(
  executionId: string,
  expected: ExecutionStatus,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await latestStatus(executionId) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    "Timed out waiting for " + executionId + " to reach " + expected +
      "; latest=" + String(await latestStatus(executionId))
  );
}

async function dispatchStatus(executionId: string): Promise<string | undefined> {
  if (!pool) throw new Error("integration pool not initialized");
  const result = await pool.query(
    "select status from logon_execution_dispatches where execution_id = $1",
    [executionId]
  );
  return result.rows[0] ? String(result.rows[0].status) : undefined;
}

describe.skipIf(!servicesAvailable)("execution loop integration", () => {
  beforeAll(async () => {
    if (!databaseUrl || !redisUrl) throw new Error("integration services unavailable");

    schemaName = "logon_test_" + randomUUID().replaceAll("-", "");
    bootstrapPool = new Pool({ connectionString: databaseUrl });
    await bootstrapPool.query('create schema "' + schemaName + '"');

    pool = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName + ",public"
    });

    await applyMigrations(pool);

    service = new PostgresExecutionService(pool);
    publisher = new ExecutionOutboxPublisher(pool);
    worker = new ExecutionWorker(
      createControlledExecutionHandler(service, "integration-worker"),
      { concurrency: 1 }
    );
    dispatcher = new ExecutionOutboxDispatcher(publisher, {
      pollIntervalMs: 50,
      maxBackoffMs: 1000
    });

    dispatcher.start();
  }, 60_000);

  afterAll(async () => {
    await dispatcher?.stop();
    await worker?.close();
    await publisher?.close();
    await pool?.end();

    if (bootstrapPool && schemaName) {
      await bootstrapPool.query('drop schema "' + schemaName + '" cascade');
      await bootstrapPool.end();
    }
  }, 60_000);

  it("runs the real Postgres → outbox → BullMQ worker → Postgres path", async () => {
    if (!service) throw new Error("service not initialized");

    const executionId = "ex-int-" + randomUUID();
    const started = await service.start(request(executionId, false));

    expect(started.reused).toBe(false);
    expect(started.event.status).toBe("INTAKE");

    await waitForStatus(executionId, "CONTEXT");

    expect(await dispatchStatus(executionId)).toBe("DISPATCHED");
  }, 60_000);

  it("holds dispatch until approval is granted", async () => {
    if (!service) throw new Error("service not initialized");

    const executionId = "ex-apr-" + randomUUID();
    const started = await service.start(request(executionId, true));

    expect(started.event.status).toBe("APPROVAL");
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(await latestStatus(executionId)).toBe("APPROVAL");
    expect(await dispatchStatus(executionId)).toBeUndefined();

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

    await waitForStatus(executionId, "EXECUTION");
    expect(await dispatchStatus(executionId)).toBe("DISPATCHED");
  }, 60_000);

  it("rejects an approval attempt bound to another execution", async () => {
    if (!service) throw new Error("service not initialized");

    const executionA = "ex-mismatch-a-" + randomUUID();
    const executionB = "ex-mismatch-b-" + randomUUID();

    await service.start(request(executionA, true));
    await service.start(request(executionB, true));

    const approvalA = await service.store.withTransaction((client) =>
      service.store.getApproval(client, executionA)
    );
    expect(approvalA?.status).toBe("PENDING");
    if (!approvalA) throw new Error("expected approval A");

    await expect(
      service.decideApproval({
        approvalId: approvalA.approvalId,
        executionId: executionB,
        status: "APPROVED",
        decidedBy: "malicious-or-mistyped-caller",
        decidedAt: new Date().toISOString()
      })
    ).rejects.toBeInstanceOf(ApprovalExecutionMismatchError);

    expect(await latestStatus(executionA)).toBe("APPROVAL");
    expect(await latestStatus(executionB)).toBe("APPROVAL");
    expect(await dispatchStatus(executionA)).toBeUndefined();
    expect(await dispatchStatus(executionB)).toBeUndefined();
  }, 60_000);

  it("persists expiry rejection before returning the expiry error", async () => {
    if (!service || !pool) throw new Error("integration service not initialized");

    const executionId = "ex-expired-" + randomUUID();
    await service.start(request(executionId, true));

    const approval = await service.store.withTransaction((client) =>
      service.store.getApproval(client, executionId)
    );
    expect(approval?.status).toBe("PENDING");
    if (!approval) throw new Error("expected approval");

    await pool.query(
      "update logon_approvals set expires_at = now() - interval '1 second' where approval_id = $1",
      [approval.approvalId]
    );

    await expect(
      service.decideApproval({
        approvalId: approval.approvalId,
        executionId,
        status: "APPROVED",
        decidedBy: "integration-reviewer",
        decidedAt: new Date().toISOString()
      })
    ).rejects.toBeInstanceOf(ApprovalExpiredError);

    expect(await latestStatus(executionId)).toBe("REJECTED");

    const persisted = await service.store.withTransaction((client) =>
      service.store.getApproval(client, executionId)
    );
    expect(persisted?.status).toBe("EXPIRED");
    expect(await dispatchStatus(executionId)).toBeUndefined();
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
