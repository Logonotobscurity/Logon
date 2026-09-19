import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertTransition } from "./state-machine.js";
import { canonicalJson } from "./canonical-json.js";
import { executionRequestSchema } from "./schemas.js";
import type { ApprovalDecision } from "./approvals.js";
import type { ExecutionEvent, ExecutionRequest, ExecutionStatus } from "./types.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { PgExecutionStore } from "./postgres-store.js";
import {
  ApprovalExpiredError,
  IdempotencyConflictError,
  InvalidExecutionTransitionError
} from "./errors.js";

export interface StartExecutionOptions {
  idempotencyKey?: string;
}

export interface StartExecutionResult {
  event: ExecutionEvent;
  reused: boolean;
}

export interface ExpireApprovalsResult {
  claimed: number;
  rejected: number;
  skipped: number;
}

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

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
            throw new IdempotencyConflictError(options.idempotencyKey);
          }

          const event = await this.store.latestEvent(client, existing.executionId);
          if (!event) {
            throw new Error("Idempotent execution has no events: " + existing.executionId);
          }
          return { event, reused: true };
        }
      }

      const status: ExecutionStatus = !decision.allowed
        ? "REJECTED"
        : decision.requiresApproval
          ? "APPROVAL"
          : "INTAKE";
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

      if (decision.allowed && decision.requiresApproval) {
        const expiresAt = new Date(Date.now() + DEFAULT_APPROVAL_TTL_MS).toISOString();
        await this.store.createApproval(client, {
          approvalId: randomUUID(),
          executionId: request.identity.executionId,
          tenantId: request.identity.tenantId,
          requestedBy: request.identity.actorId,
          reason: decision.reason,
          createdAt: new Date().toISOString(),
          expiresAt
        });
      } else if (decision.allowed) {
        await this.store.createDispatch(client, request.identity.executionId, "logon.execution");
      }

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

        // Post-insert check: another writer under the same key must match this hash.
        const recorded = await this.store.findIdempotency(
          client,
          request.identity.tenantId,
          options.idempotencyKey
        );
        if (!recorded) {
          throw new Error("Idempotency record missing after insert: " + options.idempotencyKey);
        }
        if (recorded.requestHash !== requestHash) {
          throw new IdempotencyConflictError(options.idempotencyKey);
        }
        if (recorded.executionId !== request.identity.executionId) {
          const event = await this.store.latestEvent(client, recorded.executionId);
          if (!event) {
            throw new Error("Idempotent execution has no events: " + recorded.executionId);
          }
          return { event, reused: true };
        }
      }

      return { event: stored, reused: false };
    });
  }

  async decideApproval(decision: ApprovalDecision): Promise<ApprovalDecision> {
    let expiredError: ApprovalExpiredError | undefined;

    const result = await this.store.withTransaction(async (client) => {
      const current = await this.store.lockExecution(client, decision.executionId);
      if (current !== "APPROVAL") {
        throw new Error(
          "Cannot decide approval for execution not in APPROVAL: " +
            decision.executionId +
            " (status=" +
            current +
            ")"
        );
      }

      let approvalStatus;
      try {
        approvalStatus = await this.store.decideApproval(client, decision);
      } catch (error) {
        if (error instanceof ApprovalExpiredError) {
          // The store has already marked the approval EXPIRED. Complete the
          // execution rejection and let the transaction commit before surfacing
          // the domain error to the caller.
          await this.rejectExpiredExecution(
            client,
            decision.executionId,
            decision.approvalId,
            "logon.approval.expiry"
          );
          expiredError = error;
          return undefined;
        }
        throw error;
      }

      const nextStatus: ExecutionStatus =
        approvalStatus === "APPROVED" ? "EXECUTION" : "REJECTED";

      try {
        assertTransition(current, nextStatus);
      } catch {
        throw new InvalidExecutionTransitionError(current, nextStatus);
      }

      const sequenceResult = await client.query(
        "select coalesce(max(sequence), 0) as sequence from logon_execution_events where execution_id = $1",
        [decision.executionId]
      );
      const sequence = Number(sequenceResult.rows[0].sequence) + 1;

      await client.query(
        "update logon_executions set status = $2, updated_at = now() where execution_id = $1",
        [decision.executionId, nextStatus]
      );

      await this.store.appendEvent(
        client,
        {
          executionId: decision.executionId,
          status: nextStatus,
          type: "EXECUTION_" + nextStatus,
          timestamp: decision.decidedAt,
          actorId: decision.decidedBy,
          payload: {
            approvalId: decision.approvalId,
            approvalStatus,
            reason: decision.reason ?? ("Approval " + approvalStatus.toLowerCase())
          }
        },
        sequence
      );

      if (approvalStatus === "APPROVED") {
        await this.store.createDispatch(client, decision.executionId, "logon.execution");
      }

      const tenantId = await this.lookupTenant(client, decision.executionId);
      await this.store.appendAudit(client, {
        auditId: randomUUID(),
        executionId: decision.executionId,
        tenantId,
        action: "EXECUTION_APPROVAL_DECISION",
        actorId: decision.decidedBy,
        allowed: approvalStatus === "APPROVED",
        reason: decision.reason ?? ("Approval " + approvalStatus.toLowerCase()),
        createdAt: decision.decidedAt
      });

      return decision;
    });

    if (expiredError) {
      throw expiredError;
    }
    if (!result) {
      throw new Error("Approval decision produced no result");
    }
    return result;
  }

  /**
   * Marks expired PENDING approvals and rejects still-waiting executions.
   * Safe under concurrent sweepers via FOR UPDATE SKIP LOCKED.
   */
  async expireApprovalsOnce(limit = 50): Promise<ExpireApprovalsResult> {
    return this.store.withTransaction(async (client) => {
      const claims = await this.store.claimExpiredApprovals(client, limit);
      let rejected = 0;
      let skipped = 0;

      for (const claim of claims) {
        const status = await this.store.lockExecution(client, claim.executionId);
        if (status !== "APPROVAL") {
          skipped += 1;
          continue;
        }

        await this.rejectExpiredExecution(
          client,
          claim.executionId,
          claim.approvalId,
          "logon.approval.expiry"
        );
        rejected += 1;
      }

      return { claimed: claims.length, rejected, skipped };
    });
  }

  private async rejectExpiredExecution(
    client: import("pg").PoolClient,
    executionId: string,
    approvalId: string,
    actorId: string
  ): Promise<void> {
    const sequenceResult = await client.query(
      "select coalesce(max(sequence), 0) as sequence from logon_execution_events where execution_id = $1",
      [executionId]
    );
    const sequence = Number(sequenceResult.rows[0].sequence) + 1;
    const now = new Date().toISOString();

    await client.query(
      "update logon_executions set status = 'REJECTED', updated_at = now() where execution_id = $1",
      [executionId]
    );

    await this.store.appendEvent(
      client,
      {
        executionId,
        status: "REJECTED",
        type: "EXECUTION_REJECTED",
        timestamp: now,
        actorId,
        payload: {
          approvalId,
          approvalStatus: "EXPIRED",
          reason: "Approval expired"
        }
      },
      sequence
    );

    const tenantId = await this.lookupTenant(client, executionId);
    await this.store.appendAudit(client, {
      auditId: randomUUID(),
      executionId,
      tenantId,
      action: "EXECUTION_APPROVAL_EXPIRED",
      actorId,
      allowed: false,
      reason: "Approval expired",
      createdAt: now
    });
  }

  private async lookupTenant(
    client: import("pg").PoolClient,
    executionId: string
  ): Promise<string> {
    const result = await client.query(
      "select tenant_id from logon_executions where execution_id = $1",
      [executionId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Execution not found: " + executionId);
    return String(row.tenant_id);
  }

  async transition(
    executionId: string,
    status: ExecutionStatus,
    actorId: string,
    payload: Record<string, unknown> = {}
  ): Promise<ExecutionEvent> {
    return this.store.withTransaction(async (client) => {
      const current = await this.store.lockExecution(client, executionId);
      try {
        assertTransition(current, status);
      } catch {
        throw new InvalidExecutionTransitionError(current, status);
      }

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
