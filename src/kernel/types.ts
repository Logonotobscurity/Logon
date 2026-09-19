export type ExecutionStatus =
  | "INTAKE"
  | "CONTEXT"
  | "POLICY_CHECK"
  | "PLANNING"
  | "TOOL_PERMISSION_CHECK"
  | "ACTION"
  | "VALIDATION"
  | "APPROVAL"
  | "EXECUTION"
  | "EVIDENCE"
  | "OUTCOME"
  | "EVALUATION"
  | "LEARNING"
  | "FAILED"
  | "REJECTED";

export type FailureType =
  | "MODEL_FAILURE"
  | "TOOL_FAILURE"
  | "POLICY_DENIAL"
  | "PERMISSION_DENIAL"
  | "VALIDATION_FAILURE"
  | "TIMEOUT"
  | "EXTERNAL_SYSTEM_FAILURE"
  | "HUMAN_REJECTION"
  | "UNKNOWN_OUTCOME";

export type SideEffectClass =
  | "READ"
  | "WRITE"
  | "EXTERNAL_MESSAGE"
  | "TRANSACTION"
  | "DESTRUCTIVE";

export interface ExecutionIdentity {
  executionId: string;
  tenantId: string;
  actorId: string;
  agentId: string;
  agentVersion: string;
}

export interface ExecutionRequest {
  identity: ExecutionIdentity;
  objective: string;
  context: Record<string, unknown>;
  policySet: string[];
  requestedTools: string[];
  requiresApproval: boolean;
  evidenceRequired: boolean;
  createdAt: string;
}

export interface ToolDefinition {
  toolId: string;
  version: string;
  owner: string;
  sideEffect: SideEffectClass;
  dataSensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  requiredPermission: string;
  allowedAgents: string[];
  timeoutMs: number;
  maxRetries: number;
  auditRequired: boolean;
}

export interface ToolPermission {
  tenantId: string;
  agentId: string;
  toolId: string;
  permission: string;
  allowed: boolean;
  expiresAt?: string;
}

export interface ExecutionEvent {
  executionId: string;
  sequence: number;
  type: string;
  status: ExecutionStatus;
  timestamp: string;
  actorId: string;
  payload: Record<string, unknown>;
}

export interface EvidenceRecord {
  evidenceId: string;
  executionId: string;
  tenantId: string;
  kind: "INPUT" | "TOOL_RESULT" | "VALIDATION" | "APPROVAL" | "OUTPUT" | "ERROR";
  source: string;
  payloadHash: string;
  createdAt: string;
}

export interface AuditRecord {
  auditId: string;
  executionId: string;
  tenantId: string;
  action: string;
  actorId: string;
  allowed: boolean;
  reason: string;
  createdAt: string;
}
