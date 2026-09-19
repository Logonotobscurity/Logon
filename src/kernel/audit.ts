import type { AuditRecord } from "./types.js";

export class InMemoryAuditLog {
  private readonly records: AuditRecord[] = [];

  append(record: AuditRecord): AuditRecord {
    this.records.push(record);
    return record;
  }

  listByExecution(executionId: string): AuditRecord[] {
    return this.records.filter((record) => record.executionId === executionId);
  }
}
