import type { Pool } from "pg";
import { PgExecutionStore } from "../kernel/postgres-store.js";
import { EXECUTION_QUEUE_NAME, ExecutionQueue } from "./execution-queue.js";

export interface ExecutionOutboxPublisherOptions {
  batchSize?: number;
  leaseMs?: number;
}

export interface ExecutionOutboxPublishResult {
  claimed: number;
  dispatched: number;
  failed: number;
}

export class ExecutionOutboxPublisher {
  private readonly store: PgExecutionStore;
  private readonly batchSize: number;
  private readonly leaseMs: number;

  constructor(
    pool: Pool,
    private readonly queue = new ExecutionQueue(),
    options: ExecutionOutboxPublisherOptions = {}
  ) {
    this.store = new PgExecutionStore(pool);
    this.batchSize = Math.min(Math.max(options.batchSize ?? 20, 1), 100);
    this.leaseMs = Math.min(Math.max(options.leaseMs ?? 30000, 1000), 300000);
  }

  async publishOnce(): Promise<ExecutionOutboxPublishResult> {
    const claims = await this.store.withTransaction((client) =>
      this.store.claimDispatches(client, this.batchSize, this.leaseMs)
    );

    let dispatched = 0;
    let failed = 0;

    for (const claim of claims) {
      try {
        if (claim.queueName !== EXECUTION_QUEUE_NAME) {
          throw new Error("Unsupported execution queue: " + claim.queueName);
        }

        await this.queue.enqueue(claim.executionId);
        await this.store.withTransaction((client) =>
          this.store.markDispatchSucceeded(client, claim.executionId)
        );
        dispatched += 1;
      } catch (error) {
        failed += 1;
        await this.store.withTransaction((client) =>
          this.store.markDispatchFailed(
            client,
            claim.executionId,
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    }

    return {
      claimed: claims.length,
      dispatched,
      failed
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
