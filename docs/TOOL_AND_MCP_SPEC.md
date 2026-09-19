# LOG_ON Tool and MCP Specification

## Principle
Tools are capabilities, not permissions.

Registering a tool does not grant an agent permission to use it.

## Tool definition
Each tool declares:
- tool_id
- version
- owner
- input schema
- output schema
- side-effect class
- data sensitivity
- required permission
- allowed agents
- rate limits
- timeout
- retry policy
- audit requirements

## Side-effect classes
READ
WRITE
EXTERNAL_MESSAGE
TRANSACTION
DESTRUCTIVE

Higher-risk classes require stronger approval and evidence controls.

## MCP
MCP servers are treated as untrusted integration boundaries until verified.

Before use:
- identify server
- validate transport
- enumerate tools
- inspect schemas
- assign permissions
- define data boundary
- test failure behaviour
- record provenance

The runtime must prevent a tool description from becoming an implicit authorization.
