# LOG_ON Research-to-Action Backlog — 2026-09-29

## P0 — evidence integrity

### P0.1 PAL benchmark data contract
Remove AfriSwitchCare train/test assumptions from executable evaluation code. The current dataset contract is evaluation-only/single test split.
Status: documentation corrected on research branch; code remediation remains.

### P0.2 PAL benchmark cannot produce synthetic performance results
The current evaluator contains mock transcription/placeholder semantic stages. It must not generate measured performance from those stages.
Status: identified; code guard is required before any public benchmark run.

### P0.3 Agent Assurance adversarial run
Execute the 25-case corpus against route, policy, database and execution boundaries.
Acceptance criteria:
- zero unauthorized financial execution
- zero unauthorized external writes
- zero cross-workspace execution
- duplicate-side-effect protection for replay tests
- verification failure cannot be represented as success

### P0.4 Cultural validation
Run ten native-speaker challenge cases against baseline, semantic retrieval, naive culturalization and PAL conditions. Preserve disagreement.

## P1 — architecture upgrades

### P1.1 Language-invariant tool parameters
Introduce canonical normalization between MeaningState and execution:
local-language expression -> canonical value -> schema validation -> policy.
No model-generated locale string should directly become a financial/external parameter.

### P1.2 Structured uncertainty
Represent field-level:
- specification uncertainty
- model uncertainty
- missing information
- conflicting evidence
- clarification value
Use these to choose the next question.

### P1.3 Voice authority boundary
Treat third-party voice-provider tool calls as proposals to the LOG_ON policy layer, never as independent execution authority.

### P1.4 Model-provider data policy
Route based on sensitivity and provider eligibility before benchmark quality/cost/latency.

### P1.5 MCP conformance
Inventory every LOG_ON MCP integration and flag deprecated protocol features and schema assumptions.

### P1.6 Public case-study evidence packets
For each quantified LOG_ON portfolio claim record measurement period, baseline, denominator, instrument, attribution and raw evidence before calling it verified.

### P1.7 Pan-African intelligence pilot
Run seven days in Nigeria, Kenya, Ghana, Rwanda, Uganda and Tanzania. Measure precision at discovery, verification, enrichment and opportunity translation stages.

## P2 — research expansion

### P2.1 Creator study
Compare manual, AI-assisted and AI-assisted-with-rejection-loop content workflows.

### P2.2 African AI landscape benchmark
Separate self-reported vendor capabilities from independently measured evidence for Maraba, Awarri/N-ATLaS, Mansa, Addis AI, Mutumwa, AfricanaAI, NeoformAI and related systems.

### P2.3 Research notebook agent
Expose source/claim/verification records through an authorized MCP interface only after the notebook itself has access control and provenance controls.
