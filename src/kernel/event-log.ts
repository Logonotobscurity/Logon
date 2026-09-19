import type { ExecutionEvent, ExecutionStatus } from "./types.js";

export class InMemoryEventLog {
  private readonly events = new Map<string, ExecutionEvent[]>();

  append(event: Omit<ExecutionEvent, "sequence">): ExecutionEvent {
    const current = this.events.get(event.executionId) ?? [];
    const stored: ExecutionEvent = { ...event, sequence: current.length + 1 };
    this.events.set(event.executionId, [...current, stored]);
    return stored;
  }

  list(executionId: string): ExecutionEvent[] {
    return [...(this.events.get(executionId) ?? [])];
  }

  latestStatus(executionId: string): ExecutionStatus | undefined {
    return this.events.get(executionId)?.at(-1)?.status;
  }
}
