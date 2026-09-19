import type { Pool } from "pg";
import { ExecutionOutboxDispatcher } from "../queue/execution-outbox-dispatcher.js";
import { ExecutionOutboxPublisher } from "../queue/execution-outbox-publisher.js";
import { ExecutionWorker, type ExecutionJobHandler, type ExecutionWorkerOptions } from "../queue/execution-worker.js";

export interface ExecutionRuntimeOptions extends ExecutionWorkerOptions {
  pollIntervalMs?: number;
  maxBackoffMs?: number;
}

export class ExecutionRuntime {
  readonly publisher: ExecutionOutboxPublisher;
  readonly dispatcher: ExecutionOutboxDispatcher;
  readonly worker: ExecutionWorker;

  private started = false;

  constructor(
    pool: Pool,
    handler: ExecutionJobHandler,
    options: ExecutionRuntimeOptions = {}
  ) {
    this.publisher = new ExecutionOutboxPublisher(pool);
    this.dispatcher = new ExecutionOutboxDispatcher(this.publisher, {
      pollIntervalMs: options.pollIntervalMs,
      maxBackoffMs: options.maxBackoffMs
    });
    this.worker = new ExecutionWorker(handler, {
      concurrency: options.concurrency,
      worker: options.worker
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.dispatcher.start();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      await this.worker.close();
      await this.publisher.close();
      return;
    }

    this.started = false;
    await this.dispatcher.stop();
    await this.worker.close();
    await this.publisher.close();
  }
}
