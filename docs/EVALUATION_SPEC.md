# LOG_ON Evaluation Specification

## Objective
Evaluation is part of the product, not a final QA step.

## Lifecycle
DATASET -> BASELINE -> AGENT VERSION -> EXPERIMENT -> FAILURE ANALYSIS -> HUMAN REVIEW -> FIX -> REGRESSION TEST

## Required evaluation dimensions
- task correctness
- tool selection
- policy compliance
- permission compliance
- evidence quality
- source attribution
- hallucination/error rate
- escalation behaviour
- recovery behaviour
- latency/cost where relevant

## Research datasets
LOG_ON will progressively build domain-specific datasets for:
- African-context reasoning
- Yoruba/Pidgin contextual interpretation
- code-switching
- voice-to-workflow
- agent tool permissions
- workflow correctness
- safety and escalation

## Production learning
Production failures should be promotable into regression cases after review. No model or prompt change should be considered complete until relevant regression suites pass.
