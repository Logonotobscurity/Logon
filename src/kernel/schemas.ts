import { z } from "zod";

export const executionIdentitySchema = z.object({
  executionId: z.string().min(1),
  tenantId: z.string().min(1),
  actorId: z.string().min(1),
  agentId: z.string().min(1),
  agentVersion: z.string().min(1)
});

export const executionRequestSchema = z.object({
  identity: executionIdentitySchema,
  objective: z.string().min(1),
  context: z.record(z.unknown()),
  policySet: z.array(z.string()),
  requestedTools: z.array(z.string()),
  requiresApproval: z.boolean(),
  evidenceRequired: z.boolean(),
  createdAt: z.string().datetime()
});

export type ValidatedExecutionRequest = z.infer<typeof executionRequestSchema>;
