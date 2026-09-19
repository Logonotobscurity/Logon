import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { PostgresExecutionService } from "../kernel/postgres-execution-service.js";

const port = Number(process.env.LOGON_CONTROL_PLANE_API_PORT ?? 4100);
const host = process.env.LOGON_CONTROL_PLANE_API_HOST ?? "127.0.0.1";
const pool = new Pool({
  connectionString: process.env.LOGON_DATABASE_URL ?? process.env.DATABASE_URL
});
const executionService = new PostgresExecutionService(pool);

type TenantRequest = IncomingMessage & { tenantId?: string };

function tenantId(req: IncomingMessage): string {
  const header = req.headers["x-logon-tenant-id"];
  const value = Array.isArray(header) ? header[0] : header;
  const configured = process.env.LOGON_CONTROL_PLANE_TENANT_ID;
  const tenant = (value ?? configured ?? "").trim();
  if (!tenant) {
    throw new HttpError(401, "x-logon-tenant-id is required");
  }
  return tenant;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage, maxBytes = 32_000): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(bytes);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function executionIdFrom(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/executions\/([^/]+)(?:\/approval)?$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function listExecutions(tenant: string): Promise<unknown[]> {
  const result = await pool.query(
    "select e.execution_id, e.actor_id, e.agent_id, e.agent_version, e.objective, e.status, " +
      "e.created_at, e.updated_at, " +
      "coalesce(a.pending_count, 0) as pending_approvals " +
      "from logon_executions e " +
      "left join lateral (" +
      "  select count(*) as pending_count from logon_approvals " +
      "  where execution_id = e.execution_id and tenant_id = e.tenant_id and status = 'PENDING'" +
      ") a on true " +
      "where e.tenant_id = $1 order by e.updated_at desc limit 100",
    [tenant]
  );

  return result.rows.map((row) => ({
    executionId: String(row.execution_id),
    actorId: String(row.actor_id),
    agentId: String(row.agent_id),
    agentVersion: String(row.agent_version),
    objective: String(row.objective),
    status: String(row.status),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    pendingApprovals: Number(row.pending_approvals)
  }));
}

async function getExecution(tenant: string, executionId: string): Promise<unknown> {
  const executionResult = await pool.query(
    "select execution_id, tenant_id, actor_id, agent_id, agent_version, objective, status, request_json, created_at, updated_at " +
      "from logon_executions where execution_id = $1 and tenant_id = $2",
    [executionId, tenant]
  );

  const execution = executionResult.rows[0];
  if (!execution) throw new HttpError(404, "Execution not found");

  const [events, approvals, evidence, audit, dispatch] = await Promise.all([
    pool.query(
      "select sequence, status, event_type, actor_id, payload_json, created_at " +
        "from logon_execution_events where execution_id = $1 order by sequence asc limit 1000",
      [executionId]
    ),
    pool.query(
      "select approval_id, status, requested_by, reason, decided_by, decided_at, expires_at, created_at " +
        "from logon_approvals where execution_id = $1 and tenant_id = $2 order by created_at desc",
      [executionId, tenant]
    ),
    pool.query(
      "select evidence_id, kind, source, payload_hash, created_at " +
        "from logon_evidence where execution_id = $1 and tenant_id = $2 order by created_at desc limit 500",
      [executionId, tenant]
    ),
    pool.query(
      "select audit_id, action, actor_id, allowed, reason, created_at " +
        "from logon_audit where execution_id = $1 and tenant_id = $2 order by created_at desc limit 500",
      [executionId, tenant]
    ),
    pool.query(
      "select queue_name, status, attempts, locked_until, last_error, created_at, dispatched_at " +
        "from logon_execution_dispatches where execution_id = $1",
      [executionId]
    )
  ]);

  return {
    execution: {
      executionId: String(execution.execution_id),
      tenantId: String(execution.tenant_id),
      actorId: String(execution.actor_id),
      agentId: String(execution.agent_id),
      agentVersion: String(execution.agent_version),
      objective: String(execution.objective),
      status: String(execution.status),
      request: execution.request_json,
      createdAt: new Date(execution.created_at).toISOString(),
      updatedAt: new Date(execution.updated_at).toISOString()
    },
    events: events.rows.map((row) => ({
      sequence: Number(row.sequence),
      status: String(row.status),
      type: String(row.event_type),
      actorId: String(row.actor_id),
      payload: row.payload_json ?? {},
      timestamp: new Date(row.created_at).toISOString()
    })),
    approvals: approvals.rows.map((row) => ({
      approvalId: String(row.approval_id),
      status: String(row.status),
      requestedBy: String(row.requested_by),
      reason: String(row.reason),
      ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
      ...(row.decided_at ? { decidedAt: new Date(row.decided_at).toISOString() } : {}),
      ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
      createdAt: new Date(row.created_at).toISOString()
    })),
    evidence: evidence.rows.map((row) => ({
      evidenceId: String(row.evidence_id),
      kind: String(row.kind),
      source: String(row.source),
      payloadHash: String(row.payload_hash),
      createdAt: new Date(row.created_at).toISOString()
    })),
    audit: audit.rows.map((row) => ({
      auditId: String(row.audit_id),
      action: String(row.action),
      actorId: String(row.actor_id),
      allowed: Boolean(row.allowed),
      reason: String(row.reason),
      createdAt: new Date(row.created_at).toISOString()
    })),
    dispatch: dispatch.rows[0]
      ? {
          queueName: String(dispatch.rows[0].queue_name),
          status: String(dispatch.rows[0].status),
          attempts: Number(dispatch.rows[0].attempts),
          ...(dispatch.rows[0].locked_until ? { lockedUntil: new Date(dispatch.rows[0].locked_until).toISOString() } : {}),
          ...(dispatch.rows[0].last_error ? { lastError: String(dispatch.rows[0].last_error) } : {}),
          createdAt: new Date(dispatch.rows[0].created_at).toISOString(),
          ...(dispatch.rows[0].dispatched_at ? { dispatchedAt: new Date(dispatch.rows[0].dispatched_at).toISOString() } : {})
        }
      : null
  };
}

async function decideApproval(tenant: string, executionId: string, body: Record<string, unknown>): Promise<unknown> {
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
  const status = body.status === "APPROVED" || body.status === "REJECTED" ? body.status : undefined;
  const decidedBy = typeof body.decidedBy === "string" && body.decidedBy.trim() ? body.decidedBy : "control-plane";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason : undefined;

  if (!approvalId || !status) {
    throw new HttpError(400, "approvalId and status (APPROVED|REJECTED) are required");
  }

  const ownership = await pool.query(
    "select execution_id from logon_approvals where approval_id = $1 and execution_id = $2 and tenant_id = $3",
    [approvalId, executionId, tenant]
  );
  if (ownership.rowCount !== 1) {
    throw new HttpError(404, "Approval not found for tenant and execution");
  }

  const decision = {
    approvalId,
    executionId,
    status,
    decidedBy,
    decidedAt: new Date().toISOString(),
    ...(reason ? { reason } : {})
  } as const;

  try {
    const result = await executionService.decideApproval(decision);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval decision failed";
    const expired = error instanceof Error && error.name === "ApprovalExpiredError";
    throw new HttpError(expired ? 409 : 422, message);
  }
}

async function handler(req: TenantRequest, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET" && req.url === "/health") {
      await pool.query("select 1");
      sendJson(res, 200, { ok: true, service: "logon-control-plane-api" });
      return;
    }

    if (!req.url?.startsWith("/api/")) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const tenant = tenantId(req);
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/executions") {
      sendJson(res, 200, { executions: await listExecutions(tenant) });
      return;
    }

    const executionId = executionIdFrom(pathname);
    if (!executionId) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (req.method === "GET" && pathname === `/api/executions/${encodeURIComponent(executionId)}`) {
      sendJson(res, 200, await getExecution(tenant, executionId));
      return;
    }

    if (req.method === "POST" && pathname === `/api/executions/${encodeURIComponent(executionId)}/approval`) {
      const body = await readJson(req);
      sendJson(res, 200, await decideApproval(tenant, executionId, body));
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    console.error("[logon-control-plane-api] request failed", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
}

const server = createServer((req, res) => {
  void handler(req, res);
});

server.on("error", (error) => {
  console.error("[logon-control-plane-api] server error", error);
});

const shutdown = async (signal: string): Promise<void> => {
  console.error(`[logon-control-plane-api] received ${signal}, shutting down`);
  server.close();
  await pool.end();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

if (!process.env.LOGON_DATABASE_URL && !process.env.DATABASE_URL) {
  throw new Error("LOGON_DATABASE_URL or DATABASE_URL is required");
}

server.listen(port, host, () => {
  console.error(`[logon-control-plane-api] listening on http://${host}:${port}`);
});
