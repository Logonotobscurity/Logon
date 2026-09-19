# LOG_ON Queue and Observability Boundary

## Queue contract

BullMQ is the asynchronous delivery layer. Jobs contain only an execution ID; PostgreSQL remains the source of truth for execution state and events.

The queue uses the execution ID as the BullMQ job ID to reduce duplicate enqueues. BullMQ is still treated as at-least-once delivery infrastructure, so handlers must remain idempotent and must use the PostgreSQL execution service for authoritative state changes.

Workers use a separate Redis connection policy with unlimited per-request retries, while request-side queue producers retain bounded/default Redis retry behaviour. BullMQ workers also expose stalled and failed events for operational monitoring.

## Worker → execution-service connection

`createControlledExecutionHandler(service)` is the first worker handler that talks to `PostgresExecutionService`:

- Unknown executions fail the job.
- Terminal statuses (`FAILED`, `REJECTED`, `LEARNING`) are idempotent no-ops.
- `APPROVAL` status must never reach the worker; the handler rejects those jobs.
- `INTAKE` advances one controlled step to `CONTEXT` to prove the closed transport loop.
- `EXECUTION` (post-approval) is accepted idempotently without inventing the full semantic pipeline.

## Process entrypoint

`src/runtime/main.ts` starts `ExecutionRuntime` (outbox dispatcher + worker) against PostgreSQL and Redis from environment variables:

- `LOGON_DATABASE_URL` or `DATABASE_URL` (required)
- `LOGON_REDIS_URL` or `REDIS_URL` (defaults to `redis://127.0.0.1:6379/0`)

Graceful shutdown is handled on `SIGINT` / `SIGTERM`.

Build and run:

```bash
npm run build
npm run start:runtime
```

For ESM OpenTelemetry auto-instrumentation of `pg`, load instrumentation before the entrypoint (already wired in `start:runtime` via Node `--import`).

## Observability contract

OpenTelemetry is runtime instrumentation, not business logic.

- PG database calls are automatically instrumented through the PostgreSQL instrumentation.
- Execution-specific traces can be created with withExecutionSpan().
- Service naming and exporter configuration remain environment-driven through standard OpenTelemetry environment variables.
- The instrumentation module must be loaded before application modules that import pg when automatic PG instrumentation is required.

## Runtime invariant

No worker should reconstruct or mutate authoritative execution state from Redis job data. It receives an execution ID, loads context through the application/runtime boundary, and records state transitions through PostgresExecutionService.

## Next slice

Add PostgreSQL + Redis integration tests in CI that prove:

start → outbox → dispatcher → queue → controlled handler → state transition.
