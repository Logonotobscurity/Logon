"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ExecutionSummary = {
  executionId: string;
  actorId: string;
  agentId: string;
  agentVersion: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  pendingApprovals: number;
};

type Principal = {
  subjectId: string;
  tenantId: string;
  roles: string[];
  authentication: "TRUSTED_PROXY" | "DEV";
};

type ExecutionDetail = {
  execution: {
    executionId: string;
    tenantId: string;
    actorId: string;
    agentId: string;
    agentVersion: string;
    objective: string;
    status: string;
    request: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  events: Array<{
    sequence: number;
    status: string;
    type: string;
    actorId: string;
    payload: Record<string, unknown>;
    timestamp: string;
  }>;
  approvals: Array<{
    approvalId: string;
    status: string;
    requestedBy: string;
    reason: string;
    decidedBy?: string;
    decidedAt?: string;
    expiresAt?: string;
    createdAt: string;
  }>;
  evidence: Array<{
    evidenceId: string;
    kind: string;
    source: string;
    payloadHash: string;
    createdAt: string;
  }>;
  permissions: Array<{
    agentId: string;
    toolId: string;
    permission: string;
    allowed: boolean;
    expiresAt?: string;
  }>;
  audit: Array<{
    auditId: string;
    action: string;
    actorId: string;
    allowed: boolean;
    reason: string;
    createdAt: string;
  }>;
  dispatch: {
    queueName: string;
    status: string;
    attempts: number;
    lockedUntil?: string;
    lastError?: string;
    createdAt: string;
    dispatchedAt?: string;
  } | null;
};

const devMode = process.env.NEXT_PUBLIC_LOGON_CONTROL_PLANE_DEV_MODE === "true";
const publicTenant = devMode ? (process.env.NEXT_PUBLIC_LOGON_TENANT_ID ?? "") : "";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusClass(status: string): string {
  switch (status) {
    case "FAILED":
      return "status status-danger";
    case "REJECTED":
      return "status status-warn";
    case "APPROVAL":
      return "status status-amber";
    case "EXECUTION":
    case "ACTION":
    case "VALIDATION":
      return "status status-live";
    default:
      return "status";
  }
}

function humanStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export default function ControlPlanePage() {
  const [principal, setPrincipal] = useState<Principal>();
  const [tenant, setTenant] = useState(publicTenant);
  const [tenantInput, setTenantInput] = useState(publicTenant);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<ExecutionDetail>();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const body = (await response.json()) as Principal & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to resolve authenticated principal");
        setPrincipal(body);
        if (!devMode) {
          setTenant(body.tenantId);
          setTenantInput(body.tenantId);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to resolve authenticated principal");
      }
    })();

    if (!devMode) return;

    const stored = window.sessionStorage.getItem("logon-control-plane-tenant");
    if (stored) {
      setTenant(stored);
      setTenantInput(stored);
    }
  }, []);

  const headers = useMemo(() => {
    if (!devMode) return {};
    const value = tenant.trim();
    return value ? { "x-logon-tenant-id": value } : {};
  }, [tenant]);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/executions", {
        headers,
        cache: "no-store"
      });
      const body = (await response.json()) as { executions?: ExecutionSummary[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load executions");
      setExecutions(body.executions ?? []);
      setError(undefined);
      setSelectedId((current) => current ?? body.executions?.[0]?.executionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load executions");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const loadDetail = useCallback(async (executionId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch("/api/executions/" + encodeURIComponent(executionId), {
        headers,
        cache: "no-store"
      });
      const body = (await response.json()) as ExecutionDetail & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load execution");
      setDetail(body);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load execution");
    } finally {
      setDetailLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      void loadExecutions();
      if (selectedId) void loadDetail(selectedId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, loadExecutions, loadDetail, selectedId]);

  const approve = useCallback(async (status: "APPROVED" | "REJECTED") => {
    if (!detail) return;
    const pending = detail.approvals.find((approval) => approval.status === "PENDING");
    if (!pending) return;

    setApprovalBusy(true);
    try {
      const response = await fetch(
        "/api/executions/" + encodeURIComponent(detail.execution.executionId) + "/approval",
        {
          method: "POST",
          headers: {
            ...headers,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            approvalId: pending.approvalId,
            status
          })
        }
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Approval action failed");
      await Promise.all([loadExecutions(), loadDetail(detail.execution.executionId)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval action failed");
    } finally {
      setApprovalBusy(false);
    }
  }, [detail, headers, loadExecutions, loadDetail]);

  const metrics = useMemo(() => ({
    total: executions.length,
    active: executions.filter((item) => ["INTAKE", "CONTEXT", "POLICY_CHECK", "PLANNING", "TOOL_PERMISSION_CHECK", "ACTION", "VALIDATION", "EXECUTION", "EVIDENCE", "OUTCOME", "EVALUATION"].includes(item.status)).length,
    approvals: executions.filter((item) => item.pendingApprovals > 0).length,
    failures: executions.filter((item) => item.status === "FAILED" || item.status === "REJECTED").length
  }), [executions]);

  const latestApproval = detail?.approvals.find((approval) => approval.status === "PENDING");
  const stages = [
    "INTAKE", "CONTEXT", "POLICY_CHECK", "PLANNING",
    "TOOL_PERMISSION_CHECK", "ACTION", "VALIDATION", "APPROVAL",
    "EXECUTION", "EVIDENCE", "OUTCOME", "EVALUATION", "LEARNING"
  ];

  function selectTenant(event: React.FormEvent) {
    event.preventDefault();
    const value = tenantInput.trim();
    if (!value) return;
    window.sessionStorage.setItem("logon-control-plane-tenant", value);
    setTenant(value);
    setSelectedId(undefined);
    setDetail(undefined);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <div className="eyebrow">LOG_ON OS</div>
            <h1>Control Plane</h1>
          </div>
        </div>
        <div className="top-actions">
          {devMode ? (
            <form onSubmit={selectTenant} className="tenant-form">
              <input
                aria-label="Development tenant ID"
                value={tenantInput}
                onChange={(event) => setTenantInput(event.target.value)}
                placeholder="dev tenant id"
              />
              <button type="submit">Connect</button>
            </form>
          ) : (
            <div className="principal-chip">
              <strong>{principal?.subjectId ?? "Resolving identity…"}</strong>
              <span>{principal?.tenantId ?? "—"}</span>
              <span>{principal?.roles.join(" · ") ?? "—"}</span>
            </div>
          )}
          <span className={"connection " + (error ? "connection-off" : "connection-on")}>
            <span className="dot" />
            {error ? "API attention" : "API connected"}
          </span>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="kicker">DURABLE EXECUTION / HUMAN OVERSIGHT</div>
          <h2>See what every agent is doing, why it is allowed, and what evidence it produced.</h2>
          <p>
            PostgreSQL remains the authoritative projection. This console observes and controls
            executions; it does not create a second workflow engine.
          </p>
        </div>
        <div className="hero-actions">
          <button className="button-secondary" onClick={() => void loadExecutions()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className={"button-secondary " + (autoRefresh ? "active" : "")}
            onClick={() => setAutoRefresh((current) => !current)}
          >
            Auto {autoRefresh ? "on" : "off"}
          </button>
        </div>
      </section>

      {error && (
        <div className="alert">
          <strong>Control plane error.</strong>
          <span>{error}</span>
          <span className="alert-hint">
            Check the Control Plane API/auth boundary; local development may use the explicit dev identity mode.
          </span>
        </div>
      )}

      <section className="metrics">
        <Metric label="Executions" value={metrics.total} />
        <Metric label="Active" value={metrics.active} accent />
        <Metric label="Awaiting approval" value={metrics.approvals} amber />
        <Metric label="Failed / rejected" value={metrics.failures} danger={metrics.failures > 0} />
      </section>

      <section className="workspace">
        <aside className="execution-list panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">EXECUTION INBOX</div>
              <h3>Runs</h3>
            </div>
            <span className="count">{executions.length}</span>
          </div>
          <div className="list-body">
            {executions.map((execution) => (
              <button
                key={execution.executionId}
                className={"run-row " + (execution.executionId === selectedId ? "selected" : "")}
                onClick={() => setSelectedId(execution.executionId)}
              >
                <span className="run-top">
                  <span>{execution.agentId}</span>
                  <span className={statusClass(execution.status)}>{humanStatus(execution.status)}</span>
                </span>
                <span className="run-objective">{execution.objective}</span>
                <span className="run-meta">
                  <span>{execution.executionId.slice(0, 12)}</span>
                  <span>{formatTime(execution.updatedAt)}</span>
                </span>
                {execution.pendingApprovals > 0 && (
                  <span className="approval-badge">{execution.pendingApprovals} approval</span>
                )}
              </button>
            ))}
            {!executions.length && !loading && (
              <div className="empty">No executions are visible for this tenant.</div>
            )}
            {loading && <div className="empty">Loading execution state…</div>}
          </div>
        </aside>

        <section className="detail">
          {!detail && <div className="panel empty-detail">Select an execution to inspect its lifecycle.</div>}
          {detail && (
            <>
              <section className="panel identity-card">
                <div>
                  <div className="eyebrow">EXECUTION</div>
                  <h3>{detail.execution.objective}</h3>
                  <div className="identity-line">
                    <span>{detail.execution.executionId}</span>
                    <span>tenant {detail.execution.tenantId}</span>
                    <span>agent {detail.execution.agentId}@{detail.execution.agentVersion}</span>
                  </div>
                </div>
                <div className={statusClass(detail.execution.status)}>{humanStatus(detail.execution.status)}</div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">STATE MACHINE</div>
                    <h3>Execution lifecycle</h3>
                  </div>
                  <span className="muted">{detailLoading ? "syncing…" : "live projection"}</span>
                </div>
                <div className="stage-track">
                  {stages.map((stage) => {
                    const event = detail.events.find((item) => item.status === stage);
                    const active = stage === detail.execution.status;
                    const reached = Boolean(event);
                    return (
                      <div key={stage} className={"stage " + (active ? "stage-active " : "") + (reached ? "stage-reached" : "")}>
                        <span className="stage-node">{reached ? "✓" : "·"}</span>
                        <span>{humanStatus(stage)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {latestApproval && (
                <section className="panel approval-panel">
                  <div>
                    <div className="eyebrow">HUMAN APPROVAL GATE</div>
                    <h3>Action is waiting for an explicit decision</h3>
                    <p>{latestApproval.reason}</p>
                    {latestApproval.expiresAt && (
                      <div className="muted">Expires {formatTime(latestApproval.expiresAt)}</div>
                    )}
                  </div>
                  <div className="approval-actions">
                    <button className="button-danger" disabled={approvalBusy} onClick={() => void approve("REJECTED")}>
                      Reject
                    </button>
                    <button className="button-primary" disabled={approvalBusy} onClick={() => void approve("APPROVED")}>
                      {approvalBusy ? "Applying…" : "Approve"}
                    </button>
                  </div>
                </section>
              )}

              <section className="panel contract-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">AGENT CONTRACT</div>
                    <h3>Policy, tools & permissions</h3>
                  </div>
                  <span className="muted">{detail.permissions.length} configured</span>
                </div>
                <div className="contract-grid">
                  <div>
                    <div className="proof-label">Requested tools</div>
                    <div className="tag-row">
                      {Array.isArray(detail.execution.request.requestedTools) && detail.execution.request.requestedTools.length
                        ? detail.execution.request.requestedTools.map((tool) => (
                            <span className="tag" key={String(tool)}>{String(tool)}</span>
                          ))
                        : <span className="empty-inline">None declared.</span>}
                    </div>
                  </div>
                  <div>
                    <div className="proof-label">Policy set</div>
                    <div className="tag-row">
                      {Array.isArray(detail.execution.request.policySet) && detail.execution.request.policySet.length
                        ? detail.execution.request.policySet.map((policy) => (
                            <span className="tag tag-dark" key={String(policy)}>{String(policy)}</span>
                          ))
                        : <span className="empty-inline">None declared.</span>}
                    </div>
                  </div>
                </div>
                <div className="permission-table">
                  {detail.permissions.map((item) => (
                    <div className="permission-row" key={item.toolId + item.permission}>
                      <span className={item.allowed ? "perm-allowed" : "perm-denied"}>{item.allowed ? "ALLOWED" : "DENIED"}</span>
                      <strong>{item.toolId}</strong>
                      <span>{item.permission}</span>
                      <span>{item.expiresAt ? "expires " + formatTime(item.expiresAt) : "no expiry"}</span>
                    </div>
                  ))}
                  {!detail.permissions.length && <div className="empty-inline">No tenant-level tool permission records are configured for this agent.</div>}
                </div>
              </section>

              <div className="two-col">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">EVENT LOG</div>
                      <h3>What happened</h3>
                    </div>
                  </div>
                  <div className="timeline">
                    {detail.events.map((event) => (
                      <div className="timeline-item" key={event.sequence}>
                        <span className="timeline-dot" />
                        <div>
                          <div className="timeline-main">
                            <strong>{humanStatus(event.status)}</strong>
                            <span>{formatTime(event.timestamp)}</span>
                          </div>
                          <div className="muted">{event.type} · actor {event.actorId}</div>
                          <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">PROOF</div>
                      <h3>Evidence & audit</h3>
                    </div>
                  </div>
                  <div className="proof-section">
                    <div className="proof-label">Evidence {detail.evidence.length}</div>
                    {detail.evidence.slice(0, 8).map((item) => (
                      <div className="proof-row" key={item.evidenceId}>
                        <span>{item.kind}</span>
                        <span>{item.source}</span>
                        <code>{item.payloadHash.slice(0, 16)}</code>
                      </div>
                    ))}
                    {!detail.evidence.length && <div className="empty-inline">No evidence records yet.</div>}
                  </div>
                  <div className="proof-section">
                    <div className="proof-label">Audit {detail.audit.length}</div>
                    {detail.audit.slice(0, 8).map((item) => (
                      <div className="proof-row" key={item.auditId}>
                        <span>{item.allowed ? "ALLOWED" : "DENIED"}</span>
                        <span>{item.action}</span>
                      </div>
                    ))}
                  </div>
                  <div className="dispatch">
                    <div className="proof-label">Dispatch</div>
                    {detail.dispatch ? (
                      <div className="dispatch-grid">
                        <span>queue</span><strong>{detail.dispatch.queueName}</strong>
                        <span>status</span><strong>{detail.dispatch.status}</strong>
                        <span>attempts</span><strong>{detail.dispatch.attempts}</strong>
                      </div>
                    ) : (
                      <div className="empty-inline">No dispatch record.</div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </section>

      <footer className="footer">
        <span>LOG_ON · Execution is controlled by the kernel.</span>
        <span>Can do ≠ may do.</span>
      </footer>
    </main>
  );
}

function Metric({
  label,
  value,
  accent,
  amber,
  danger
}: {
  label: string;
  value: number;
  accent?: boolean;
  amber?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="metric panel">
      <span>{label}</span>
      <strong className={(accent ? "metric-accent " : "") + (amber ? "metric-amber " : "") + (danger ? "metric-danger" : "")}>
        {value}
      </strong>
    </div>
  );
}
