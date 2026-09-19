import type { ExecutionStatus } from "../kernel/types.js";

/**
 * Controlled semantic pipeline: each worker invocation advances at most one step.
 * This is the agent runtime boundary — not a second workflow engine.
 */
export const SEMANTIC_STEP: Partial<
  Record<ExecutionStatus, { next: ExecutionStatus; reason: string }>
> = {
  INTAKE: {
    next: "CONTEXT",
    reason: "Assemble execution context"
  },
  CONTEXT: {
    next: "POLICY_CHECK",
    reason: "Evaluate execution policy"
  },
  POLICY_CHECK: {
    next: "PLANNING",
    reason: "Policy allowed; enter planning"
  },
  PLANNING: {
    next: "TOOL_PERMISSION_CHECK",
    reason: "Plan accepted; check tool permissions"
  },
  TOOL_PERMISSION_CHECK: {
    next: "ACTION",
    reason: "Tool permissions granted; enter action"
  },
  ACTION: {
    next: "VALIDATION",
    reason: "Action phase complete; validate outcomes"
  },
  VALIDATION: {
    next: "EXECUTION",
    reason: "Validation passed; record execution outcomes"
  },
  EXECUTION: {
    next: "EVIDENCE",
    reason: "Capture evidence"
  },
  EVIDENCE: {
    next: "OUTCOME",
    reason: "Evidence recorded; finalize outcome"
  },
  OUTCOME: {
    next: "EVALUATION",
    reason: "Outcome recorded; evaluate"
  },
  EVALUATION: {
    next: "LEARNING",
    reason: "Evaluation complete; learning terminal"
  }
};

export function nextSemanticStep(
  status: ExecutionStatus
): { next: ExecutionStatus; reason: string } | undefined {
  return SEMANTIC_STEP[status];
}
