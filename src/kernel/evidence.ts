import type { EvidenceRecord } from "./types.js";

export class InMemoryEvidenceLedger {
  private readonly records: EvidenceRecord[] = [];

  append(record: EvidenceRecord): EvidenceRecord {
    this.records.push(record);
    return record;
  }

  listByExecution(executionId: string): EvidenceRecord[] {
    return this.records.filter((record) => record.executionId === executionId);
  }
}
