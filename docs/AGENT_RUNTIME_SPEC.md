# LOG_ON Agent Runtime Specification

## Agent contract
Every agent declares:
- agent_id
- version
- objective
- input schema
- output schema
- allowed tools
- permission scope
- policy set
- context sources
- approval gates
- timeout/retry policy
- evaluation suite
- escalation rules

## Runtime flow
1. Load task and tenant context.
2. Resolve applicable policy.
3. Construct bounded context.
4. Generate a plan.
5. Validate requested tool calls against permissions.
6. Execute approved calls.
7. Validate outputs.
8. Record evidence and trace.
9. Escalate when confidence, policy or validation thresholds are not met.
10. Emit outcome and evaluation events.

## Failure handling
Failures are first-class events. The runtime must distinguish:
- model failure
- tool failure
- policy denial
- permission denial
- validation failure
- timeout
- external-system failure
- human rejection
- unknown/ambiguous outcome

No agent may silently convert an error into success.

## Model abstraction
Business logic must not depend directly on a single model provider. A model gateway should expose a stable internal contract so providers can be replaced without rewriting domain workflows.
