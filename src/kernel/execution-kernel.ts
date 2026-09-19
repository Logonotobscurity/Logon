import { assertTransition } from "./state-machine.js";
import type { ExecutionEvent, ExecutionRequest, ExecutionStatus } from "./types.js";
import { InMemoryAuditLog } from "./audit.js";
import { InMemoryEventLog } from "./event-log.js";
import { InMemoryEvidenceLedger } from "./evidence.js";
import { evaluateExecutionPolicy } from "./policy.js";
import { executionRequestSchema } from "./schemas.js";

export class ExecutionKernel {
  readonly events = new InMemoryEventLog();
  readonly audit = new InMemoryAuditLog();
  readonly evidence = new InMemoryEvidenceLedger();

  start(rawRequest: ExecutionRequest): ExecutionEvent {
    const request = executionRequestSchema.parse(rawRequest);
    const decision = evaluateExecutionPolicy(request);

    this.audit.append({
      auditId: crypto.randomUUID(),
      executionId: request.identity.executionId,
      tenantId: request.identity.tenantId,
      action: "EXECUTION_POLICY_CHECK",
      actorId: request.identity.actorId,
      allowed: decision.allowed,
      reason: decision.reason,
      createdAt: new Date().toISOString()
    });

    if (!decision.allowed) {
      return this.transition(request.identity.executionId, "REJECTED", request.identity.actorId, {
        reason: decision.reason
      });
    }

    return this.append("INTAKE", request.identity.executionId, request.identity.actorId, {
      objective: request.objective,
      agentId: request.identity.agentId,
      agentVersion: request.identity.agentVersion
    });
  }

  transition(
    executionId: string,
    status: ExecutionStatus,
    actorId: string,
    payload: Record<string, unknown> = {}
  ): ExecutionEvent {
    const current = this.events.latestStatus(executionId);
    if (current) assertTransition(current, status);

    return this.append(status, executionId, actorId, payload);
  }

  fail(executionId: string, actorId: string, reason: string): ExecutionEvent {
    const current = this.events.latestStatus(executionId);
    if (current && current !== "FAILED" && current !== "REJECTED" && current !== "LEARNING") {
      return this.transition(executionId, "FAILED", actorId, { reason });
    }
    return this.append("FAILED", executionId, actorId, { reason });
  }

  private append(
    status: ExecutionStatus,
    executionId: string,
    actorId: string,
    payload: Record<string, unknown>
  ): ExecutionEvent {
    return this.events.append({
      executionId,
      status,
      type: `EXECUTION_${status}`,
      timestamp: new Date().toISOString(),
      actorId,
      payload
    });
  }
}
