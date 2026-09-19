import type { ExecutionOutboxPublisher, ExecutionOutboxPublishResult } from "./execution-outbox-publisher.js";

export interface ExecutionOutboxDispatcherOptions {
  pollIntervalMs?: number;
  maxBackoffMs?: number;
}

export class ExecutionOutboxDispatcher {
  private readonly pollIntervalMs: number;
  private readonly maxBackoffMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private publishing = false;
  private failureBackoffMs = 0;

  constructor(
    private readonly publisher: Pick<ExecutionOutboxPublisher, "publishOnce">,
    options: ExecutionOutboxDispatcherOptions = {}
  ) {
    this.pollIntervalMs = Math.min(Math.max(options.pollIntervalMs ?? 1000, 100), 60000);
    this.maxBackoffMs = Math.min(Math.max(options.maxBackoffMs ?? 30000, this.pollIntervalMs), 300000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  async runOnce(): Promise<ExecutionOutboxPublishResult> {
    if (this.publishing) {
      return { claimed: 0, dispatched: 0, failed: 0 };
    }

    this.publishing = true;
    try {
      return await this.publisher.publishOnce();
    } finally {
      this.publishing = false;
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

    while (this.publishing) {
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

    let nextDelay = this.pollIntervalMs;
    try {
      const result = await this.runOnce();
      if (result.failed > 0) {
        this.failureBackoffMs = this.failureBackoffMs === 0
          ? this.pollIntervalMs * 2
          : Math.min(this.maxBackoffMs, this.failureBackoffMs * 2);
        nextDelay = this.failureBackoffMs;
      } else {
        this.failureBackoffMs = 0;
        nextDelay = this.pollIntervalMs;
      }
    } catch {
      this.failureBackoffMs = this.failureBackoffMs === 0
        ? this.pollIntervalMs * 2
        : Math.min(this.maxBackoffMs, this.failureBackoffMs * 2);
      nextDelay = this.failureBackoffMs;
    }

    this.schedule(nextDelay);
  }
}
