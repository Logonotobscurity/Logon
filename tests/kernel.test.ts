import { describe, expect, it } from "vitest";
import {
  ExecutionKernel,
  assertTransition,
  canTransition,
  checkToolPermission,
  evaluateToolPolicy,
  executionRequestSchema
} from "../src/kernel/index.js";

describe("LOG_ON execution kernel", () => {
  it("enforces the controlled lifecycle", () => {
    expect(canTransition("INTAKE", "CONTEXT")).toBe(true);
    expect(canTransition("INTAKE", "EXECUTION")).toBe(false);
    expect(() => assertTransition("INTAKE", "EXECUTION")).toThrow();
  });

  it("requires explicit tenant/agent/tool permission", () => {
    const request = {
      identity: {
        executionId: "ex-1",
        tenantId: "tenant-a",
        actorId: "actor-a",
        agentId: "agent-a",
        agentVersion: "0.1.0"
      },
      objective: "Send approved customer follow-up",
      context: {},
      policySet: ["baseline"],
      requestedTools: ["crm.send"],
      requiresApproval: false,
      evidenceRequired: true,
      createdAt: new Date().toISOString()
    };

    const parsed = executionRequestSchema.parse(request);
    const tool = {
      toolId: "crm.send",
      version: "1.0.0",
      owner: "LOG_ON",
      sideEffect: "EXTERNAL_MESSAGE" as const,
      dataSensitivity: "CONFIDENTIAL" as const,
      requiredPermission: "crm:message",
      allowedAgents: ["agent-a"],
      timeoutMs: 10000,
      maxRetries: 2,
      auditRequired: true
    };

    expect(evaluateToolPolicy(parsed, tool).allowed).toBe(true);
    expect(checkToolPermission(parsed, tool, undefined).allowed).toBe(false);
    expect(checkToolPermission(parsed, tool, {
      tenantId: "tenant-a",
      agentId: "agent-a",
      toolId: "crm.send",
      permission: "crm:message",
      allowed: true
    }).allowed).toBe(true);
  });

  it("records a validated execution before work proceeds", () => {
    const kernel = new ExecutionKernel();
    const event = kernel.start({
      identity: {
        executionId: "ex-2",
        tenantId: "tenant-a",
        actorId: "actor-a",
        agentId: "agent-a",
        agentVersion: "0.1.0"
      },
      objective: "Create an audit",
      context: {},
      policySet: ["baseline"],
      requestedTools: [],
      requiresApproval: false,
      evidenceRequired: true,
      createdAt: new Date().toISOString()
    });

    expect(event.status).toBe("INTAKE");
    expect(kernel.events.latestStatus("ex-2")).toBe("INTAKE");
    expect(kernel.audit.listByExecution("ex-2")).toHaveLength(1);
  });
});
