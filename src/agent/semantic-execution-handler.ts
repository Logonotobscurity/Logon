import type { PostgresExecutionService } from "../kernel/postgres-execution-service.js";
import type { ExecutionStatus } from "../kernel/types.js";
import { InvalidExecutionTransitionError } from "../kernel/errors.js";
import type { ExecutionJobHandler } from "../queue/execution-worker.js";
import { nextSemanticStep } from "./pipeline.js";

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  "FAILED",
  "REJECTED",
  "LEARNING"
]);

/**
 * Semantic agent pipeline handler.
 *
 * Advances the durable execution state machine one controlled step per job
 * delivery. Tool/model adapters plug in later; this establishes the loop,
 * idempotency, and PostgreSQL authority before inventing provider behaviour.
 */
export function createSemanticExecutionHandler(
  service: PostgresExecutionService,
  actorId = "logon.agent.runtime"
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

    if (latest.status === "APPROVAL") {
      throw new Error(
        "Execution still requires approval and must not be dispatched: " + executionId
      );
    }

    const step = nextSemanticStep(latest.status);
    if (!step) {
      // Unknown mid-state with no mapping: leave for a specialized handler.
      return;
    }

    try {
      await service.transition(executionId, step.next, actorId, {
        source: "semantic-execution-handler",
        reason: step.reason,
        from: latest.status,
        to: step.next
      });
    } catch (error) {
      if (!(error instanceof InvalidExecutionTransitionError)) {
        throw error;
      }

      // Concurrent worker won the race; only swallow if we landed on the target.
      const afterRace = await service.store.withTransaction((client) =>
        service.store.latestEvent(client, executionId)
      );
      if (afterRace?.status !== step.next) {
        throw error;
      }
    }
  };
}
