import { Worker, type Job, type WorkerOptions } from "bullmq";
import type { ExecutionJobData, ExecutionJobResult } from "./execution-queue.js";
import { EXECUTION_QUEUE_NAME } from "./execution-queue.js";
import { redisWorkerConnectionFromEnv } from "./redis-connection.js";

export type ExecutionJobHandler = (
  executionId: string,
  job: Job<ExecutionJobData, ExecutionJobResult>
) => Promise<void>;

export interface ExecutionWorkerOptions {
  concurrency?: number;
  worker?: Omit<WorkerOptions, "connection" | "concurrency">;
}

export class ExecutionWorker {
  readonly worker: Worker<ExecutionJobData, ExecutionJobResult>;

  constructor(
    handler: ExecutionJobHandler,
    options: ExecutionWorkerOptions = {}
  ) {
    const concurrency = options.concurrency ?? 5;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Worker concurrency must be a positive integer");
    }

    this.worker = new Worker<ExecutionJobData, ExecutionJobResult>(
      EXECUTION_QUEUE_NAME,
      async (job) => {
        await handler(job.data.executionId, job);
        return { acceptedAt: new Date().toISOString() };
      },
      {
        connection: redisWorkerConnectionFromEnv(),
        concurrency,
        ...options.worker
      }
    );
  }

  onFailed(listener: (job: Job<ExecutionJobData, ExecutionJobResult> | undefined, error: Error) => void): this {
    this.worker.on("failed", (job, error) => listener(job, error));
    return this;
  }

  onStalled(listener: (jobId: string) => void): this {
    this.worker.on("stalled", listener);
    return this;
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
