import { describe, expect, it, vi } from "vitest";
import { nextSemanticStep, SEMANTIC_STEP } from "../src/agent/pipeline.js";
import { createSemanticExecutionHandler } from "../src/agent/semantic-execution-handler.js";
import type { PostgresExecutionService } from "../src/kernel/postgres-execution-service.js";
import type { ExecutionEvent, ExecutionStatus } from "../src/kernel/types.js";
import { migrationVersion } from "../src/db/migrate.js";

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
  const transition = vi.fn(async (_id: string, status: ExecutionStatus) => event(status));
  return {
    store: {
      withTransaction: async (work: (client: unknown) => Promise<unknown>) => work({}),
      latestEvent: async () => latest
    },
    transition
  } as unknown as PostgresExecutionService;
}

describe("semantic pipeline", () => {
  it("maps each active status to exactly one next step until LEARNING", () => {
    expect(nextSemanticStep("INTAKE")?.next).toBe("CONTEXT");
    expect(nextSemanticStep("CONTEXT")?.next).toBe("POLICY_CHECK");
    expect(nextSemanticStep("EVALUATION")?.next).toBe("LEARNING");
    expect(nextSemanticStep("LEARNING")).toBeUndefined();
    expect(nextSemanticStep("APPROVAL")).toBeUndefined();
    expect(Object.keys(SEMANTIC_STEP).length).toBeGreaterThanOrEqual(10);
  });

  it("advances one step per handler invocation", async () => {
    const service = mockService(event("CONTEXT"));
    const handler = createSemanticExecutionHandler(service, "test-agent");
    await handler("ex-1", {} as never);
    expect(service.transition).toHaveBeenCalledWith(
      "ex-1",
      "POLICY_CHECK",
      "test-agent",
      expect.objectContaining({ from: "CONTEXT", to: "POLICY_CHECK" })
    );
  });

  it("is a no-op on terminal statuses", async () => {
    const service = mockService(event("LEARNING"));
    const handler = createSemanticExecutionHandler(service);
    await handler("ex-1", {} as never);
    expect(service.transition).not.toHaveBeenCalled();
  });

  it("rejects APPROVAL-state jobs", async () => {
    const service = mockService(event("APPROVAL"));
    const handler = createSemanticExecutionHandler(service);
    await expect(handler("ex-1", {} as never)).rejects.toThrow(/still requires approval/);
  });
});

describe("migration versioning", () => {
  it("extracts zero-padded version prefixes", () => {
    expect(migrationVersion("0001_kernel.sql")).toBe("0001");
    expect(migrationVersion("0005_approval_execution_integrity.sql")).toBe("0005");
  });
});
