import type { ExecutionRequest, ToolDefinition, ToolPermission } from "./types.js";

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export function checkToolPermission(
  request: ExecutionRequest,
  tool: ToolDefinition,
  permission: ToolPermission | undefined
): PermissionDecision {
  if (!permission) {
    return { allowed: false, reason: "No explicit tenant/agent/tool permission exists." };
  }

  if (permission.tenantId !== request.identity.tenantId) {
    return { allowed: false, reason: "Permission belongs to a different tenant." };
  }

  if (permission.agentId !== request.identity.agentId || permission.toolId !== tool.toolId) {
    return { allowed: false, reason: "Permission does not match the requesting agent and tool." };
  }

  if (!permission.allowed || permission.permission !== tool.requiredPermission) {
    return { allowed: false, reason: "Required permission was not granted." };
  }

  if (permission.expiresAt && Date.parse(permission.expiresAt) <= Date.now()) {
    return { allowed: false, reason: "Permission has expired." };
  }

  return { allowed: true, reason: "Explicit permission granted." };
}
