import { describe, expect, it, vi } from "vitest";
import { createControlledExecutionHandler } from "../src/runtime/controlled-execution-handler.js";
import type { PostgresExecutionService } from "../src/kernel/postgres-execution-service.js";
import { InvalidExecutionTransitionError } from "../src/kernel/errors.js";
import type { ExecutionEvent, ExecutionStatus } from "../src/kernel/types.js";

function event(status: ExecutionStatus, executionId = "ex-1"): ExecutionEvent {
  return {
    executionId,
    sequence: 1,
    type: "EXECUTION_" + status,
    status,
    timestamp: new Date().toISOString(),
    actorId: "actor-a",
    payload: {}
  };
}

function mockService(latest: ExecutionEvent | undefined): PostgresExecutionService {
  const transition = vi.fn(async () => event("CONTEXT"));
  return {
    store: {
      withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
      latestEvent: async () => latest
    },
    transition
  } as unknown as PostgresExecutionService;
}

describe("controlled execution handler", () => {
  it("advances INTAKE to CONTEXT through PostgresExecutionService", async () => {
    const service = mockService(event("INTAKE"));
    const handler = createControlledExecutionHandler(service, "test-worker");

    await handler("ex-1", {} as never);

    expect(service.transition).toHaveBeenCalledWith(
      "ex-1",
      "CONTEXT",
      "test-worker",
      expect.objectContaining({ source: "controlled-execution-handler" })
    );
  });

  it("is a no-op for terminal statuses", async () => {
    for (const status of ["FAILED", "REJECTED", "LEARNING"] as const) {
      const service = mockService(event(status));
      const handler = createControlledExecutionHandler(service);
      await handler("ex-1", {} as never);
      expect(service.transition).not.toHaveBeenCalled();
    }
  });

  it("rejects jobs that are still waiting on approval", async () => {
    const service = mockService(event("APPROVAL"));
    const handler = createControlledExecutionHandler(service);

    await expect(handler("ex-1", {} as never)).rejects.toThrow(/still requires approval/);
    expect(service.transition).not.toHaveBeenCalled();
  });

  it("accepts EXECUTION idempotently without inventing semantic work", async () => {
    const service = mockService(event("EXECUTION"));
    const handler = createControlledExecutionHandler(service);

    await handler("ex-1", {} as never);
    expect(service.transition).not.toHaveBeenCalled();
  });

  it("treats a concurrent transition to CONTEXT as successful delivery", async () => {
    let latest: ExecutionEvent = event("INTAKE");
    const transition = vi.fn(async () => {
      latest = event("CONTEXT");
      throw new InvalidExecutionTransitionError("INTAKE", "CONTEXT");
    });
    const service = {
      store: {
        withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
        latestEvent: async () => latest
      },
      transition
    } as unknown as PostgresExecutionService;

    const handler = createControlledExecutionHandler(service);
    await handler("ex-1", {} as never);

    expect(transition).toHaveBeenCalledTimes(1);
  });

  it("fails when the execution is unknown", async () => {
    const service = mockService(undefined);
    const handler = createControlledExecutionHandler(service);

    await expect(handler("missing", {} as never)).rejects.toThrow(/Unknown execution/);
  });
});
