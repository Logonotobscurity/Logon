import type { ExecutionRequest, ToolDefinition } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

const highImpact = new Set(["TRANSACTION", "DESTRUCTIVE"]);

export function evaluateExecutionPolicy(request: ExecutionRequest): PolicyDecision {
  if (!request.objective.trim()) {
    return { allowed: false, requiresApproval: false, reason: "Objective is required." };
  }

  return {
    allowed: true,
    requiresApproval: request.requiresApproval,
    reason: "Execution request satisfies baseline kernel policy."
  };
}

export function evaluateToolPolicy(
  request: ExecutionRequest,
  tool: ToolDefinition
): PolicyDecision {
  if (!tool.allowedAgents.includes(request.identity.agentId)) {
    return { allowed: false, requiresApproval: false, reason: "Agent is not allowlisted for this tool." };
  }

  const approval = request.requiresApproval || highImpact.has(tool.sideEffect);

  return {
    allowed: true,
    requiresApproval: approval,
    reason: approval
      ? "Tool is allowed but requires an approval gate."
      : "Tool is allowed under the registered policy."
  };
}
