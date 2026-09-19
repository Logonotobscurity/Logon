# LOG_ON Execution Kernel Specification

## Purpose
The execution kernel is the shared foundation for every LOG_ON business system. It turns a requested outcome into controlled, observable, auditable work.

## Core invariant
**Can do != may do.**

Every execution must have:
- identity
- objective
- context
- policy
- permissions
- tools
- limits
- approval requirements
- evidence requirements
- validation
- audit trail
- recovery behaviour

## Execution lifecycle
INTAKE -> CONTEXT -> POLICY CHECK -> PLAN -> TOOL PERMISSION CHECK -> ACTION -> VALIDATION -> APPROVAL (when required) -> EXECUTION -> EVIDENCE -> OUTCOME -> EVALUATION -> LEARNING

## Runtime principles
1. Deterministic business rules remain outside the model.
2. Models propose; policy and permission layers decide whether actions are allowed.
3. High-impact actions require explicit approval.
4. Every external side effect produces an event and evidence record.
5. PostgreSQL is authoritative application state.
6. Redis/BullMQ is operational infrastructure, not source of truth.
7. Agents are replaceable; business contracts are not.
8. Every production workflow must be testable and observable.

## Initial stack
Next.js + TypeScript, PostgreSQL, Zod, BullMQ/Redis, LangGraph, n8n, MCP, OpenTelemetry, Langfuse.

## Non-goals
- generic autonomous-agent marketplace
- model-specific business logic
- dashboard-first architecture
- unrestricted agent autonomy
