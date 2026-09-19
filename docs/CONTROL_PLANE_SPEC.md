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

### GET /api/me

Requires an authenticated Control Plane principal.

Returns the subject, tenant, roles, and authentication mode used for the current request.

### GET /api/executions

Requires an authenticated Control Plane principal.

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

## Identity and RBAC

Tenant scope is derived from a Control Plane principal at the API boundary.

Production mode requires LOGON_CONTROL_PLANE_TRUSTED_PROXY=true. The trusted edge must authenticate the user, strip any incoming x-logon-auth-* headers, and inject:

- x-logon-auth-subject
- x-logon-auth-tenant
- x-logon-auth-roles

The API treats these claims as trusted only behind that configured boundary.

Local development can set LOGON_CONTROL_PLANE_DEV_MODE=true. In that mode explicit development headers/environment values are accepted. This mode must never be enabled on a public deployment.

Roles currently defined:

- VIEWER: read-only Control Plane access.
- OPERATOR: operational/read access.
- APPROVER: read access plus human approval decisions.
- ADMIN: full first-slice Control Plane access including approvals.

The approval endpoint deliberately ignores any browser-supplied decidedBy value and records the authenticated principal subject as the decision actor.

## Local development

1. Set LOGON_DATABASE_URL.
2. Set LOGON_CONTROL_PLANE_API_PORT=4100 or use the default.
3. Optionally set LOGON_CONTROL_PLANE_TENANT_ID.
4. Build the kernel.
5. Start the API.
6. Start the Next.js Control Plane.

The browser can also persist a tenant ID for the local session through the tenant field in the UI.

## Deliberate non-goals in this slice

- SSO provider integration / role provisioning
- real-time WebSocket/SSE transport
- agent-plan editing
- direct tool execution from the browser
- registry CRUD
- evaluation dashboards beyond durable event/proof visibility

These belong in subsequent Control Plane slices and must continue to use kernel contracts instead of creating browser-owned business rules.


## Security status

Authentication provider integration is not complete in this slice. The API now has a fail-closed principal resolver and RBAC boundary, with a trusted-proxy contract for production deployment and an explicit dev-only fallback for local testing.
