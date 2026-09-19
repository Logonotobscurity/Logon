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
The current implementation uses in-memory stores. PostgreSQL, Redis/BullMQ, OpenTelemetry and LangGraph are integration layers behind these contracts rather than domain logic.

## Next production slice
1. PostgreSQL repositories for executions, events, permissions, tools, evidence and audit records.
2. Transactional event writes and tenant-scoped queries.
3. BullMQ worker integration.
4. OpenTelemetry trace/span propagation.
5. Model gateway interface.
6. Approval records and idempotency keys.
7. Durable secret/config management.
8. PostgreSQL integration tests.

## Non-regression invariants
- A registered tool does not grant permission.
- Tenant, agent, tool and permission must match.
- High-impact tools can require approval.
- Invalid state transitions are rejected.
- Failed work cannot silently become success.
- Audit and evidence remain separate concerns.
- Business logic does not depend on a specific model provider.
