import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertTransition } from "./state-machine.js";
import { canonicalJson } from "./canonical-json.js";
import { executionRequestSchema } from "./schemas.js";
import type { ExecutionEvent, ExecutionRequest, ExecutionStatus } from "./types.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { PgExecutionStore } from "./postgres-store.js";

export interface StartExecutionOptions {
  idempotencyKey?: string;
}

export interface StartExecutionResult {
  event: ExecutionEvent;
  reused: boolean;
}

export class PostgresExecutionService {
  readonly store: PgExecutionStore;

  constructor(pool: Pool) {
    this.store = new PgExecutionStore(pool);
  }

  async start(
    rawRequest: ExecutionRequest,
    options: StartExecutionOptions = {}
  ): Promise<StartExecutionResult> {
    const request = executionRequestSchema.parse(rawRequest);
    const requestHash = createHash("sha256")
      .update(canonicalJson(request))
      .digest("hex");
    const decision = evaluateExecutionPolicy(request);

    return this.store.withTransaction(async (client) => {
      await this.store.ensureTenant(client, request.identity.tenantId);

      if (options.idempotencyKey) {
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1, 0))",
          [request.identity.tenantId + ":" + options.idempotencyKey]
        );

        const existing = await this.store.findIdempotency(
          client,
          request.identity.tenantId,
          options.idempotencyKey
        );
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new Error(
              "Idempotency key reuse with a different request: " + options.idempotencyKey
            );
          }

          const event = await this.store.latestEvent(client, existing.executionId);
          if (!event) {
            throw new Error("Idempotent execution has no events: " + existing.executionId);
          }
          return { event, reused: true };
        }
      }


      const status: ExecutionStatus = decision.allowed ? "INTAKE" : "REJECTED";
      await this.store.createExecution(client, request, status);

      const event: Omit<ExecutionEvent, "sequence"> = {
        executionId: request.identity.executionId,
        status,
        type: "EXECUTION_" + status,
        timestamp: new Date().toISOString(),
        actorId: request.identity.actorId,
        payload: decision.allowed
          ? {
              objective: request.objective,
              agentId: request.identity.agentId,
              agentVersion: request.identity.agentVersion
            }
          : { reason: decision.reason }
      };

      const stored = await this.store.appendEvent(client, event, 1);

      await this.store.appendAudit(client, {
        auditId: randomUUID(),
        executionId: request.identity.executionId,
        tenantId: request.identity.tenantId,
        action: "EXECUTION_POLICY_CHECK",
        actorId: request.identity.actorId,
        allowed: decision.allowed,
        reason: decision.reason,
        createdAt: new Date().toISOString()
      });

      if (options.idempotencyKey) {
        await this.store.putIdempotency(
          client,
          request.identity.tenantId,
          options.idempotencyKey,
          request.identity.executionId,
          requestHash
        );
      }

      return { event: stored, reused: false };
    });
  }

  async transition(
    executionId: string,
    status: ExecutionStatus,
    actorId: string,
    payload: Record<string, unknown> = {}
  ): Promise<ExecutionEvent> {
    return this.store.withTransaction(async (client) => {
      const current = await this.store.lockExecution(client, executionId);
      assertTransition(current, status);

      const event: Omit<ExecutionEvent, "sequence"> = {
        executionId,
        status,
        type: "EXECUTION_" + status,
        timestamp: new Date().toISOString(),
        actorId,
        payload
      };

      const existing = await client.query(
        "select coalesce(max(sequence), 0) as sequence from logon_execution_events where execution_id = $1",
        [executionId]
      );
      const sequence = Number(existing.rows[0].sequence) + 1;

      await client.query(
        "update logon_executions set status = $2, updated_at = now() where execution_id = $1",
        [executionId, status]
      );

      return this.store.appendEvent(client, event, sequence);
    });
  }

  async fail(
    executionId: string,
    actorId: string,
    reason: string
  ): Promise<ExecutionEvent> {
    return this.store.withTransaction(async (client) => {
      const current = await this.store.lockExecution(client, executionId);
      if (current === "FAILED" || current === "REJECTED" || current === "LEARNING") {
        throw new Error("Cannot fail terminal execution: " + executionId);
      }

      const event: Omit<ExecutionEvent, "sequence"> = {
        executionId,
        status: "FAILED",
        type: "EXECUTION_FAILED",
        timestamp: new Date().toISOString(),
        actorId,
        payload: { reason }
      };

      const existing = await client.query(
        "select coalesce(max(sequence), 0) as sequence from logon_execution_events where execution_id = $1",
        [executionId]
      );
      const sequence = Number(existing.rows[0].sequence) + 1;

      await client.query(
        "update logon_executions set status = 'FAILED', updated_at = now() where execution_id = $1",
        [executionId]
      );

      return this.store.appendEvent(client, event, sequence);
    });
  }
}
