# System 0 — Shared Execution Kernel Implementation

This slice turns the LOG_ON kernel specification into executable TypeScript contracts.

## Implemented
- Zod-validated execution requests
- explicit execution state transitions
- tenant/agent/tool permission checks
- tool registry
- policy decisions separated from permissions
- append-only in-memory execution events
- audit records
- evidence ledger primitives
- kernel facade for starting, transitioning and failing executions
- unit tests for core invariants

## Deliberate boundary
The domain tests still use in-memory stores, while the repository now includes a PostgreSQL runtime adapter and transactional execution service. PostgreSQL, Redis/BullMQ, OpenTelemetry and LangGraph remain integration layers behind the domain contracts rather than domain logic.

## Production progress
1. PostgreSQL execution/event/audit/idempotency persistence is implemented.
2. Transactional start, transition and failure paths are implemented with execution-row locking.
3. Deterministic request hashing and tenant-scoped idempotency are implemented.
4. PostgreSQL status/evidence/approval constraints are defined in a follow-up migration.

## Next production slice
1. BullMQ worker integration behind PostgresExecutionService.
2. OpenTelemetry trace/span propagation.
3. Model gateway adapter(s).
4. Approval repository and approval enforcement on high-impact transitions.
5. Durable secret/config management.
6. PostgreSQL integration tests in CI with a service container.

## Non-regression invariants
- A registered tool does not grant permission.
- Tenant, agent, tool and permission must match.
- High-impact tools can require approval.
- Invalid state transitions are rejected.
- Failed work cannot silently become success.
- Audit and evidence remain separate concerns.
- Business logic does not depend on a specific model provider.
