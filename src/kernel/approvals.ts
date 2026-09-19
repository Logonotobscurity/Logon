export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export type ApprovalDecisionStatus = "APPROVED" | "REJECTED";

export interface ApprovalRequest {
  approvalId: string;
  executionId: string;
  tenantId: string;
  requestedBy: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ApprovalDecision {
  approvalId: string;
  executionId: string;
  status: ApprovalDecisionStatus;
  decidedBy: string;
  decidedAt: string;
  reason?: string;
}

export interface IdempotencyRecord {
  key: string;
  tenantId: string;
  executionId: string;
  requestHash: string;
  createdAt: string;
}
