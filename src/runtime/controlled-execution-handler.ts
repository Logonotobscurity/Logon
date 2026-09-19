import type { PostgresExecutionService } from "../kernel/postgres-execution-service.js";
import type { ExecutionStatus } from "../kernel/types.js";
import type { ExecutionJobHandler } from "../queue/execution-worker.js";

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  "FAILED",
  "REJECTED",
  "LEARNING"
]);

/**
 * Minimal worker handler that connects BullMQ jobs to PostgresExecutionService.
 *
 * Deliberate boundary:
 * - Jobs carry only execution IDs; PostgreSQL remains authoritative.
 * - INTAKE is advanced one controlled step to CONTEXT to prove the transport loop.
 * - Full semantic pipeline (planning, tools, model calls) is not invented here.
 * - Handlers must remain safe under at-least-once delivery.
 */
export function createControlledExecutionHandler(
  service: PostgresExecutionService,
  actorId = "logon.execution.worker"
): ExecutionJobHandler {
  return async (executionId) => {
    if (!executionId.trim()) {
      throw new Error("executionId is required");
    }

    const latest = await service.store.withTransaction((client) =>
      service.store.latestEvent(client, executionId)
    );

    if (!latest) {
      throw new Error("Unknown execution: " + executionId);
    }

    if (TERMINAL_STATUSES.has(latest.status)) {
      return;
    }

    // Approval-gated work must never reach the worker while still PENDING.
    if (latest.status === "APPROVAL") {
      throw new Error(
        "Execution still requires approval and must not be dispatched: " + executionId
      );
    }

    // Controlled first pipeline step for the non-approval intake path.
    if (latest.status === "INTAKE") {
      await service.transition(executionId, "CONTEXT", actorId, {
        source: "controlled-execution-handler",
        reason: "Worker accepted execution and advanced controlled lifecycle"
      });
      return;
    }

    // Post-approval (EXECUTION) and mid-pipeline statuses: accept idempotently.
    // Semantic execution work belongs to a later pipeline slice.
  };
}
