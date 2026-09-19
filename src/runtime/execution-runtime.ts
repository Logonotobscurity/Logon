import type { Pool } from "pg";
import { PostgresExecutionService } from "../kernel/postgres-execution-service.js";
import { ExecutionOutboxDispatcher } from "../queue/execution-outbox-dispatcher.js";
import { ExecutionOutboxPublisher } from "../queue/execution-outbox-publisher.js";
import { ExecutionWorker, type ExecutionJobHandler, type ExecutionWorkerOptions } from "../queue/execution-worker.js";
import { ApprovalExpirySweeper } from "./approval-expiry-sweeper.js";

export interface ExecutionRuntimeOptions extends ExecutionWorkerOptions {
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  approvalSweepIntervalMs?: number;
  approvalSweepBatchSize?: number;
  enableApprovalSweeper?: boolean;
}

export class ExecutionRuntime {
  readonly publisher: ExecutionOutboxPublisher;
  readonly dispatcher: ExecutionOutboxDispatcher;
  readonly worker: ExecutionWorker;
  readonly approvalSweeper: ApprovalExpirySweeper | undefined;
  readonly executionService: PostgresExecutionService;

  private started = false;

  constructor(
    pool: Pool,
    handler: ExecutionJobHandler,
    options: ExecutionRuntimeOptions = {}
  ) {
    this.executionService = new PostgresExecutionService(pool);
    this.publisher = new ExecutionOutboxPublisher(pool);
    this.dispatcher = new ExecutionOutboxDispatcher(this.publisher, {
      pollIntervalMs: options.pollIntervalMs,
      maxBackoffMs: options.maxBackoffMs
    });
    this.worker = new ExecutionWorker(handler, {
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(options.worker !== undefined ? { worker: options.worker } : {})
    });

    const enableSweeper = options.enableApprovalSweeper !== false;
    this.approvalSweeper = enableSweeper
      ? new ApprovalExpirySweeper(this.executionService, {
          pollIntervalMs: options.approvalSweepIntervalMs,
          batchSize: options.approvalSweepBatchSize
        })
      : undefined;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.dispatcher.start();
    this.approvalSweeper?.start();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      await this.approvalSweeper?.stop();
      await this.worker.close();
      await this.publisher.close();
      return;
    }

    this.started = false;
    await this.approvalSweeper?.stop();
    await this.dispatcher.stop();
    await this.worker.close();
    await this.publisher.close();
  }
}
