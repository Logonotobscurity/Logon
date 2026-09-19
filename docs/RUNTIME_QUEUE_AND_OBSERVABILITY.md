# LOG_ON Queue and Observability Boundary

## Queue contract

BullMQ is the asynchronous delivery layer. Jobs contain only an execution ID; PostgreSQL remains the source of truth for execution state and events.

The queue uses the execution ID as the BullMQ job ID to reduce duplicate enqueues. BullMQ is still treated as at-least-once delivery infrastructure, so handlers must remain idempotent and must use the PostgreSQL execution service for authoritative state changes.

Workers use a separate Redis connection policy with unlimited per-request retries, while request-side queue producers retain bounded/default Redis retry behaviour. BullMQ workers also expose stalled and failed events for operational monitoring.

## Observability contract

OpenTelemetry is runtime instrumentation, not business logic.

- PG database calls are automatically instrumented through the PostgreSQL instrumentation.
- Execution-specific traces can be created with withExecutionSpan().
- Service naming and exporter configuration remain environment-driven through standard OpenTelemetry environment variables.
- The instrumentation module must be loaded before application modules that import pg when automatic PG instrumentation is required.

For ESM services, load the compiled instrumentation module before the worker or application entrypoint, for example with Node's --import mechanism.

## Runtime invariant

No worker should reconstruct or mutate authoritative execution state from Redis job data. It receives an execution ID, loads context through the application/runtime boundary, and records state transitions through PostgresExecutionService.

## Next slice

The next layer should connect the queue worker to the existing execution service, then add approval persistence/enforcement and an integration-test database service in CI.
