import type { ExecutionStatus } from "./types.js";

const transitions: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  INTAKE: ["CONTEXT", "FAILED"],
  CONTEXT: ["POLICY_CHECK", "FAILED"],
  POLICY_CHECK: ["PLANNING", "REJECTED", "FAILED"],
  PLANNING: ["TOOL_PERMISSION_CHECK", "FAILED"],
  TOOL_PERMISSION_CHECK: ["ACTION", "APPROVAL", "REJECTED", "FAILED"],
  ACTION: ["VALIDATION", "FAILED"],
  VALIDATION: ["APPROVAL", "EXECUTION", "FAILED"],
  APPROVAL: ["EXECUTION", "REJECTED", "FAILED"],
  EXECUTION: ["EVIDENCE", "FAILED"],
  EVIDENCE: ["OUTCOME", "FAILED"],
  OUTCOME: ["EVALUATION", "FAILED"],
  EVALUATION: ["LEARNING", "FAILED"],
  LEARNING: [],
  FAILED: [],
  REJECTED: []
};

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid execution transition: ${from} -> ${to}`);
  }
}

export function allowedTransitions(from: ExecutionStatus): readonly ExecutionStatus[] {
  return transitions[from];
}
