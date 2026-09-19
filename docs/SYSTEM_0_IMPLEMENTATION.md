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

## Production progress
5. BullMQ execution queue and worker adapters are implemented; jobs carry execution IDs only.
6. OpenTelemetry Node instrumentation and execution-worker spans are implemented.
7. A transactional execution outbox protects the PostgreSQL-to-Redis handoff.

## Next production slice
1. Connect the worker handler to the full semantic execution pipeline and PostgresExecutionService.
2. Approval repository and approval enforcement on high-impact transitions.
3. Durable secret/config management.
4. PostgreSQL + Redis integration tests in CI with service containers.
5. Model gateway provider adapters.

## Non-regression invariants
- A registered tool does not grant permission.
- Tenant, agent, tool and permission must match.
- High-impact tools can require approval.
- Invalid state transitions are rejected.
- Failed work cannot silently become success.
- Audit and evidence remain separate concerns.
- Business logic does not depend on a specific model provider.
