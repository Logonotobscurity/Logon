import { describe, expect, it, vi } from "vitest";
import { ExecutionOutboxDispatcher } from "../src/queue/execution-outbox-dispatcher.js";

describe("execution outbox dispatcher", () => {
  it("runs one publish cycle without overlapping publishers", async () => {
    let release!: () => void;
    const publishOnce = vi.fn(
      () =>
        new Promise<{ claimed: number; dispatched: number; failed: number }>((resolve) => {
          release = () => resolve({ claimed: 1, dispatched: 1, failed: 0 });
        })
    );

    const dispatcher = new ExecutionOutboxDispatcher({ publishOnce }, { pollIntervalMs: 100 });
    const first = dispatcher.runOnce();
    const second = await dispatcher.runOnce();

    expect(second).toEqual({ claimed: 0, dispatched: 0, failed: 0 });
    release();
    await expect(first).resolves.toEqual({ claimed: 1, dispatched: 1, failed: 0 });
    expect(publishOnce).toHaveBeenCalledTimes(1);
  });

  it("starts and stops a polling lifecycle idempotently", async () => {
    const publishOnce = vi.fn(async () => ({ claimed: 0, dispatched: 0, failed: 0 }));
    const dispatcher = new ExecutionOutboxDispatcher({ publishOnce }, { pollIntervalMs: 100 });

    dispatcher.start();
    dispatcher.start();
    expect(dispatcher.isRunning).toBe(true);

    await dispatcher.stop();
    await dispatcher.stop();
    expect(dispatcher.isRunning).toBe(false);
  });
});
