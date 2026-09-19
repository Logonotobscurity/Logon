export class LogonError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LogonError";
    this.code = code;
  }
}

export class IdempotencyConflictError extends LogonError {
  constructor(key: string) {
    super("IDEMPOTENCY_CONFLICT", "Idempotency key reuse with a different request: " + key);
    this.name = "IdempotencyConflictError";
  }
}

export class ApprovalExpiredError extends LogonError {
  constructor(approvalId: string) {
    super("APPROVAL_EXPIRED", "Approval has expired: " + approvalId);
    this.name = "ApprovalExpiredError";
  }
}

export class ApprovalNotPendingError extends LogonError {
  constructor(approvalId: string) {
    super("APPROVAL_NOT_PENDING", "Approval is not pending: " + approvalId);
    this.name = "ApprovalNotPendingError";
  }
}

export class InvalidExecutionTransitionError extends LogonError {
  constructor(from: string, to: string) {
    super("INVALID_TRANSITION", "Invalid execution transition: " + from + " -> " + to);
    this.name = "InvalidExecutionTransitionError";
  }
}

export class ExecutionNotFoundError extends LogonError {
  constructor(executionId: string) {
    super("EXECUTION_NOT_FOUND", "Execution not found: " + executionId);
    this.name = "ExecutionNotFoundError";
  }
}

export class ApprovalNotFoundError extends LogonError {
  constructor(approvalId: string) {
    super("APPROVAL_NOT_FOUND", "Approval not found: " + approvalId);
    this.name = "ApprovalNotFoundError";
  }
}
