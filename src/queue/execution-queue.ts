import { Queue, type Job } from "bullmq";
import { redisConnectionFromEnv } from "./redis-connection.js";

export const EXECUTION_QUEUE_NAME = "logon.execution";

export interface ExecutionJobData {
  executionId: string;
}

export interface ExecutionJobResult {
  acceptedAt: string;
}

export class ExecutionQueue {
  readonly queue: Queue<ExecutionJobData, ExecutionJobResult>;

  constructor(queue = new Queue<ExecutionJobData, ExecutionJobResult>(
    EXECUTION_QUEUE_NAME,
    {
      connection: redisConnectionFromEnv(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000
        },
        removeOnComplete: false,
        removeOnFail: false
      }
    }
  )) {
    this.queue = queue;
  }

  async enqueue(executionId: string): Promise<Job<ExecutionJobData, ExecutionJobResult>> {
    if (!executionId.trim()) {
      throw new Error("executionId is required");
    }

    return this.queue.add(
      "execute",
      { executionId },
      {
        jobId: executionId
      }
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
