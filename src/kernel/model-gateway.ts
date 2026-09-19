import { z } from "zod";

export const modelRequestSchema = z.object({
  model: z.string().min(1),
  input: z.unknown(),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional()
});

export type ModelRequest = z.infer<typeof modelRequestSchema>;

export interface ModelResponse {
  provider: string;
  model: string;
  output: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
  requestId?: string;
}

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
