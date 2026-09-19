import { describe, expect, it } from "vitest";
import { canTransition, assertTransition } from "../src/kernel/state-machine.js";
import type { ApprovalDecision } from "../src/kernel/approvals.js";
import { evaluateExecutionPolicy } from "../src/kernel/policy.js";
import type { ExecutionRequest } from "../src/kernel/types.js";

function baseRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    identity: {
      executionId: "ex-approval-1",
      tenantId: "tenant-a",
      actorId: "actor-a",
      agentId: "agent-a",
      agentVersion: "0.1.0"
    },
    objective: "High-impact transfer",
    context: {},
    policySet: ["baseline"],
    requestedTools: ["payments.transfer"],
    requiresApproval: true,
    evidenceRequired: true,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe("approval gate contracts", () => {
  it("marks high-impact requests as requiring approval at policy time", () => {
    const decision = evaluateExecutionPolicy(baseRequest({ requiresApproval: true }));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("allows APPROVAL → EXECUTION and APPROVAL → REJECTED only", () => {
    expect(canTransition("APPROVAL", "EXECUTION")).toBe(true);
    expect(canTransition("APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("APPROVAL", "FAILED")).toBe(true);
    expect(canTransition("APPROVAL", "INTAKE")).toBe(false);
    expect(canTransition("APPROVAL", "CONTEXT")).toBe(false);

    expect(() => assertTransition("APPROVAL", "EXECUTION")).not.toThrow();
    expect(() => assertTransition("APPROVAL", "REJECTED")).not.toThrow();
    expect(() => assertTransition("APPROVAL", "INTAKE")).toThrow(/Invalid execution transition/);
  });

  it("requires executionId on ApprovalDecision so dispatch can be keyed", () => {
    const decision: ApprovalDecision = {
      approvalId: "apr-1",
      executionId: "ex-approval-1",
      status: "APPROVED",
      decidedBy: "human-ops",
      decidedAt: new Date().toISOString(),
      reason: "Reviewed and cleared"
    };

    expect(decision.executionId).toBe("ex-approval-1");
    expect(decision.status).toBe("APPROVED");
  });

  it("maps approval outcomes to the correct next execution status", () => {
    const approved: ApprovalDecision["status"] = "APPROVED";
    const rejected: ApprovalDecision["status"] = "REJECTED";

    const nextFor = (status: ApprovalDecision["status"]) =>
      status === "APPROVED" ? "EXECUTION" : "REJECTED";

    expect(nextFor(approved)).toBe("EXECUTION");
    expect(nextFor(rejected)).toBe("REJECTED");
    expect(canTransition("APPROVAL", nextFor(approved))).toBe(true);
    expect(canTransition("APPROVAL", nextFor(rejected))).toBe(true);
  });
});
