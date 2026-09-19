# LOG_ON PostgreSQL Runtime Boundary

This slice introduces the first durable execution boundary for System 0.

## Responsibilities

- PgExecutionStore is the PostgreSQL adapter. It does not contain agent reasoning or business policy.
- PostgresExecutionService owns the transaction boundary for execution creation and state transitions.
- PostgreSQL is authoritative for execution status, event sequence, audit records and idempotency records.
- The same checked-out PostgreSQL client is used for every statement in a transaction.
- Execution-row locking serializes concurrent transitions for one execution.

## Start semantics

start() validates the request, evaluates the existing execution policy, creates the tenant if needed, persists the execution and first event, writes the policy audit record, and optionally records an idempotency key in one transaction.

When an idempotency key already exists with the same request hash, the existing execution is returned. Reusing the key with a different request is rejected.

## Transition semantics

transition() locks the authoritative execution row, validates the state-machine edge, calculates the next event sequence while the row is locked, updates the execution status, and appends the event in one transaction.

fail() follows the same pattern and cannot fail an already terminal execution.

## Deliberate non-goals

This slice does not add BullMQ, OpenTelemetry or model-provider code. Those should consume this boundary rather than bypass it.

## Invariants

1. Every persisted execution has a tenant.
2. Execution status and the event stream are updated together.
3. A transition cannot bypass the state machine.
4. Concurrent transitions on one execution serialize on the execution row.
5. Idempotency is tenant-scoped and request-hash checked.
6. Transaction rollback preserves all-or-nothing writes.
