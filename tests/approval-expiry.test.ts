import { describe, expect, it, vi } from "vitest";
import { ApprovalExpirySweeper } from "../src/runtime/approval-expiry-sweeper.js";
import {
  ApprovalExpiredError,
  IdempotencyConflictError,
  InvalidExecutionTransitionError
} from "../src/kernel/errors.js";

describe("approval expiry sweeper", () => {
  it("runs one sweep without overlapping work", async () => {
    let release!: () => void;
    const expireApprovalsOnce = vi.fn(
      () =>
        new Promise<{ claimed: number; rejected: number; skipped: number }>((resolve) => {
          release = () => resolve({ claimed: 2, rejected: 2, skipped: 0 });
        })
    );

    const sweeper = new ApprovalExpirySweeper({ expireApprovalsOnce }, { pollIntervalMs: 100 });
    const first = sweeper.runOnce();
    const second = await sweeper.runOnce();

    expect(second).toEqual({ claimed: 0, rejected: 0, skipped: 0 });
    release();
    await expect(first).resolves.toEqual({ claimed: 2, rejected: 2, skipped: 0 });
    expect(expireApprovalsOnce).toHaveBeenCalledTimes(1);
  });

  it("starts and stops idempotently", async () => {
    const expireApprovalsOnce = vi.fn(async () => ({ claimed: 0, rejected: 0, skipped: 0 }));
    const sweeper = new ApprovalExpirySweeper({ expireApprovalsOnce }, { pollIntervalMs: 100 });

    sweeper.start();
    sweeper.start();
    expect(sweeper.isRunning).toBe(true);

    await sweeper.stop();
    await sweeper.stop();
    expect(sweeper.isRunning).toBe(false);
  });
});

describe("domain errors", () => {
  it("exposes stable codes for callers and observability", () => {
    expect(new IdempotencyConflictError("k1").code).toBe("IDEMPOTENCY_CONFLICT");
    expect(new ApprovalExpiredError("a1").code).toBe("APPROVAL_EXPIRED");
    expect(new InvalidExecutionTransitionError("APPROVAL", "INTAKE").code).toBe("INVALID_TRANSITION");
  });
});
