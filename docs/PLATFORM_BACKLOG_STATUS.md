# LOG_ON Platform Backlog — Audited Status

Last updated against repository reality (not aspiration).

## Dependency order (do not skip)

1. **Phase 1 — Verifiable kernel** (CI green on real runners)
2. **Phase 2 — Secure Control Plane** (real IdP + isolation tests)
3. **Phase 3 — Semantic agent runtime** (this branch starts the skeleton)
4. Agent builder → assurance → intelligence → business OS → platformization

## In progress on feat/v2-2-platform-core

- [x] Production migration runner + `logon_schema_migrations`
- [x] Hardened PostgreSQL pool factory
- [x] Semantic pipeline step map (INTAKE → … → LEARNING)
- [x] `createSemanticExecutionHandler` (one durable step per job)
- [ ] Provider-backed planning / tool execution (not invented yet)
- [ ] Real SSO/OIDC
- [ ] CI green (blocked by GitHub billing lock)

## Explicit non-goals for this branch

- Intelligence cloud, billing, CRM, voice product, multi-agent board UI
- Replacing the kernel with a second workflow engine
- Claiming production readiness without green `ci-gate`

## Rule

Prove one vertical slice end-to-end before expanding surface area.
