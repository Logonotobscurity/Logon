import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { AuditRecord, ExecutionEvent, ExecutionRequest } from "./types.js";

type DbClient = Pick<PoolClient, "query">;

export interface IdempotencyLookup {
  executionId: string;
  requestHash: string;
}

export interface PostgresExecutionStore {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>;
  ensureTenant(client: DbClient, tenantId: string): Promise<void>;
  createExecution(client: DbClient, request: ExecutionRequest, status: ExecutionEvent["status"]): Promise<void>;
  appendEvent(
    client: DbClient,
    event: Omit<ExecutionEvent, "sequence">,
    sequence: number
  ): Promise<ExecutionEvent>;
  lockExecution(client: DbClient, executionId: string): Promise<ExecutionEvent["status"]>;
  appendAudit(client: DbClient, record: AuditRecord): Promise<void>;
  findIdempotency(client: DbClient, tenantId: string, key: string): Promise<IdempotencyLookup | undefined>;
  putIdempotency(
    client: DbClient,
    tenantId: string,
    key: string,
    executionId: string,
    requestHash: string
  ): Promise<void>;
  listEvents(executionId: string, limit?: number): Promise<ExecutionEvent[]>;
}

function asStatus(value: string): ExecutionEvent["status"] {
  return value as ExecutionEvent["status"];
}

function asRowObject(row: QueryResultRow): Record<string, unknown> {
  return row as Record<string, unknown>;
}

export class PgExecutionStore implements PostgresExecutionStore {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureTenant(client: DbClient, tenantId: string): Promise<void> {
    await client.query(
      "insert into logon_tenants (tenant_id) values ($1) on conflict (tenant_id) do nothing",
      [tenantId]
    );
  }

  async createExecution(
    client: DbClient,
    request: ExecutionRequest,
    status: ExecutionEvent["status"]
  ): Promise<void> {
    await client.query(
      "insert into logon_executions " +
        "(execution_id, tenant_id, actor_id, agent_id, agent_version, objective, status, request_json, created_at, updated_at) " +
        "values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::timestamptz,$9::timestamptz)",
      [
        request.identity.executionId,
        request.identity.tenantId,
        request.identity.actorId,
        request.identity.agentId,
        request.identity.agentVersion,
        request.objective,
        status,
        JSON.stringify(request),
        request.createdAt
      ]
    );
  }

  async appendEvent(
    client: DbClient,
    event: Omit<ExecutionEvent, "sequence">,
    sequence: number
  ): Promise<ExecutionEvent> {
    await client.query(
      "insert into logon_execution_events " +
        "(execution_id, sequence, status, event_type, actor_id, payload_json, created_at) " +
        "values ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)",
      [
        event.executionId,
        sequence,
        event.status,
        event.type,
        event.actorId,
        JSON.stringify(event.payload),
        event.timestamp
      ]
    );

    return { ...event, sequence };
  }

  async lockExecution(client: DbClient, executionId: string): Promise<ExecutionEvent["status"]> {
    const result = await client.query(
      "select status from logon_executions where execution_id = $1 for update",
      [executionId]
    );
    if (result.rowCount !== 1) {
      throw new Error("Execution not found: " + executionId);
    }
    return asStatus(String(asRowObject(result.rows[0]).status));
  }

  async appendAudit(client: DbClient, record: AuditRecord): Promise<void> {
    await client.query(
      "insert into logon_audit " +
        "(audit_id, execution_id, tenant_id, action, actor_id, allowed, reason, created_at) " +
        "values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)",
      [
        record.auditId,
        record.executionId,
        record.tenantId,
        record.action,
        record.actorId,
        record.allowed,
        record.reason,
        record.createdAt
      ]
    );
  }

  async findIdempotency(
    client: DbClient,
    tenantId: string,
    key: string
  ): Promise<IdempotencyLookup | undefined> {
    const result = await client.query(
      "select execution_id, request_hash from logon_idempotency where tenant_id = $1 and idempotency_key = $2",
      [tenantId, key]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      executionId: String(row.execution_id),
      requestHash: String(row.request_hash)
    };
  }

  async putIdempotency(
    client: DbClient,
    tenantId: string,
    key: string,
    executionId: string,
    requestHash: string
  ): Promise<void> {
    await client.query(
      "insert into logon_idempotency " +
        "(tenant_id, idempotency_key, execution_id, request_hash) " +
        "values ($1,$2,$3,$4) " +
        "on conflict (tenant_id, idempotency_key) do nothing",
      [tenantId, key, executionId, requestHash]
    );
  }

  async listEvents(executionId: string, limit = 100): Promise<ExecutionEvent[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 1000);
    const result = await this.pool.query(
      "select execution_id, sequence, status, event_type, actor_id, payload_json, created_at " +
        "from logon_execution_events " +
        "where execution_id = $1 order by sequence asc limit $2",
      [executionId, boundedLimit]
    );

    return result.rows.map((row) => ({
      executionId: String(row.execution_id),
      sequence: Number(row.sequence),
      status: asStatus(String(row.status)),
      type: String(row.event_type),
      timestamp: new Date(row.created_at).toISOString(),
      actorId: String(row.actor_id),
      payload: (row.payload_json ?? {}) as Record<string, unknown>
    }));
  }
}
