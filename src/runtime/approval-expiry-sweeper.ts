import type { PostgresExecutionService, ExpireApprovalsResult } from "../kernel/postgres-execution-service.js";

export interface ApprovalExpirySweeperOptions {
  pollIntervalMs?: number;
  batchSize?: number;
}

export class ApprovalExpirySweeper {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private sweeping = false;

  constructor(
    private readonly service: Pick<PostgresExecutionService, "expireApprovalsOnce">,
    options: ApprovalExpirySweeperOptions = {}
  ) {
    this.pollIntervalMs = Math.min(Math.max(options.pollIntervalMs ?? 5000, 500), 300000);
    this.batchSize = Math.min(Math.max(options.batchSize ?? 50, 1), 100);
  }

  get isRunning(): boolean {
    return this.running;
  }

  async runOnce(): Promise<ExpireApprovalsResult> {
    if (this.sweeping) {
      return { claimed: 0, rejected: 0, skipped: 0 };
    }

    this.sweeping = true;
    try {
      return await this.service.expireApprovalsOnce(this.batchSize);
    } finally {
      this.sweeping = false;
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    while (this.sweeping) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    this.timer = undefined;
    if (!this.running) return;

    try {
      await this.runOnce();
    } catch {
      // Keep the sweeper alive; next tick retries.
    }

    this.schedule(this.pollIntervalMs);
  }
}
