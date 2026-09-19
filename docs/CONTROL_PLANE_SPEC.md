# LOG_ON Control Plane Specification

## Purpose

The Control Plane is the operator-facing projection of the LOG_ON execution kernel.

It is not a second workflow engine. PostgreSQL remains authoritative; the Control Plane reads durable execution state and sends bounded human decisions back through the kernel service.

## Boundary

~~~text
Next.js Control Plane
        |
        | same-origin /api proxy
        v
Control Plane HTTP API
        |
        +--> tenant-scoped read model
        |
        +--> PostgresExecutionService.decideApproval()
        |
        v
PostgreSQL  <---->  Redis/BullMQ  <---->  Execution Worker
~~~

## Operator surfaces

The first slice exposes:

- execution inbox
- active/approval/failure metrics
- execution identity and objective
- state-machine lifecycle projection
- human approval gate
- event timeline
- evidence records
- audit records
- dispatch state
- requested tools and policy set
- tenant/agent tool permissions

## API contract

### GET /health

Returns service health after a PostgreSQL connectivity check.

### GET /api/executions

Requires x-logon-tenant-id.

Returns up to 100 executions belonging to that tenant, ordered by most recently updated.

### GET /api/executions/:executionId

Requires x-logon-tenant-id.

Returns the execution, events, approvals, evidence, audit, dispatch, and tenant/agent tool permissions. Every read is tenant-scoped.

### POST /api/executions/:executionId/approval

Requires x-logon-tenant-id.

Body:

~~~json
{
  "approvalId": "approval-id",
  "status": "APPROVED",
  "decidedBy": "operator-id",
  "reason": "optional"
}
~~~

The API verifies tenant ownership of the approval before calling PostgresExecutionService.decideApproval(). The kernel remains responsible for state transition, expiry, audit, and dispatch semantics.

## Frontend contract

The browser must never infer authoritative execution state from local React state.

Client state is cache/projection only:

- reload from /api/executions for the inbox
- reload from /api/executions/:id for execution detail
- treat POST approval responses as acknowledgements, then reload from the PostgreSQL-backed projection
- never mark an action complete solely because a browser request returned 200

## Tenant isolation

The first slice intentionally requires an explicit tenant identifier. Authentication/identity federation is not implemented yet.

Production deployment must replace the client-supplied tenant header with a trusted identity/session boundary. The API must derive tenant scope from the authenticated principal and ignore arbitrary browser-supplied tenant identifiers.

## Local development

1. Set LOGON_DATABASE_URL.
2. Set LOGON_CONTROL_PLANE_API_PORT=4100 or use the default.
3. Optionally set LOGON_CONTROL_PLANE_TENANT_ID.
4. Build the kernel.
5. Start the API.
6. Start the Next.js Control Plane.

The browser can also persist a tenant ID for the local session through the tenant field in the UI.

## Deliberate non-goals in this slice

- authentication / SSO
- RBAC and role provisioning
- real-time WebSocket/SSE transport
- agent-plan editing
- direct tool execution from the browser
- registry CRUD
- evaluation dashboards beyond durable event/proof visibility

These belong in subsequent Control Plane slices and must continue to use kernel contracts instead of creating browser-owned business rules.
