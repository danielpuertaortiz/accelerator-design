---
artifact: accelerator-architecture-data-collection
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 3 of 5
status: draft
updated: 2026-11-23
depends-on: [02-product-canvas]
feeds: [scenario-generator, eval-runner, voice-quality-scorer, scorecard, human-eval-ui]
---

# Architecture: Data Collection Block

## Context

Every downstream capability — scenario generation, eval runner, voice scoring, reporting, human eval UI — needs data before it can work. Today that data lives in three disconnected places and devs access it manually. The data collection block is the first piece of architecture because everything else depends on it.

## Intent and evidence

The data model separates **intent** (what the agent is configured to do) from **evidence** (what actually happened at runtime):

| | Source | What it answers |
|---|---|---|
| **Intent** | Terraform | What is the agent *configured* to do? (flow paths, prompts, intents, guardrails) |
| **Evidence** | S3 recordings | How did the agent *sound*? |
| | S3 transcripts | What did the agent *say*? (requires Contact Lens) |
| | CloudWatch | *How* did the agent process the request internally? (flow path, decisions, timing) |

**Terraform is the anchor.** It defines the specification — every possible conversation path, prompt, guardrail, and action. The evidence sources show what actually happened against that spec. Without Terraform, the framework can still score recordings and transcripts, but it can't assess coverage, path correctness, or guardrail compliance.

**All sources are optional, but at least one must be present.** Missing sources degrade gracefully — the test case fills in what it can and leaves the rest null. Downstream capabilities adapt based on what's present.

## Two-step pipeline: select → build

Contact metadata is cheap; full artifacts (transcripts, traces) are expensive. The pipeline samples **before** collecting the expensive data, so total cost is proportional to sample size, not total contact volume.

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: SELECT  (cheap — one API call + local computation)         │
│                                                                     │
│  Enumerate contacts with metadata (flow, outcome, duration, ts)     │
│  ──→ Stratified sampling (by intent, outcome, path, duration)       │
│  ──→ Selected contact list (N + buffer for PII/quality filtering)   │
│                                                                     │
│  Parse Terraform ──→ spec model (intent)                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: BUILD  (bounded — only selected contacts)                  │
│                                                                     │
│  Collect evidence for selected contacts:                            │
│    Recording URIs, transcripts, execution traces                    │
│    PII detection (pluggable)                                        │
│                                                                     │
│  Assemble into dataset:                                             │
│    Correlate evidence with spec version                             │
│    ──→ Partition (judge-calibration vs. eval — no overlap)          │
│    ──→ Path coverage analysis                                       │
│    ──→ PII summary                                                  │
│    ──→ Immutable dataset snapshot                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Why sample-before-collect

| Approach | 10,000 contacts, need 50 test cases |
|---|---|
| **Collect-then-sample** | 10,000 API calls for transcripts + traces. Then throw away 99.5%. |
| **Select-then-build** | 1 API call for metadata. Sample 60–70 contacts (with buffer). ~70 API calls for full data. |

### Re-running

- **Different sampling criteria** → re-run both steps (new sample = new contacts = new collection). Still bounded by sample size.
- **Different partitioning or coverage params** → re-run the assemble portion of Step 2 only (local, instant — same collected data, different split).

## Execution model

Both pipeline steps process data in batches with checkpoint/resume. Batch size is configurable per step.

- **SELECT** — Enumerates contacts in pages, applying sampling criteria incrementally. A persistent page failure halts enumeration (partial list = biased sample) and reports progress for resume.
- **BUILD** — Collects evidence for selected contacts in bounded batches. Collectors run in parallel per contact with bounded concurrency per AWS service.

### Token budgets

The collection block doesn't call scoring models, but it must produce data that fits within downstream context windows.

| Constraint | How the architecture handles it |
|---|---|
| **Model context window** (Bedrock/Gemini) | Collection captures content size metadata (transcript word count, trace event count, audio duration) per test case. Downstream consumers use this to plan their own batching. |
| **PII detection input limit** (Comprehend 100 KB) | Oversized transcripts are chunked before PII detection; redaction results merged. |

### Retries and failure handling

All API calls retry with exponential backoff, jitter, and a configurable retry budget. Operations are idempotent — resumed runs can safely re-process the boundary batch.

**Failure semantics differ by step:**

- **SELECT** — A persistent page failure halts the step (incomplete enumeration would bias sampling). The pipeline can resume from the last successful page.
- **BUILD** — A failed collector reduces test data surface, nothing else. The contact is still assembled with whatever collectors succeeded — a collector failure is functionally identical to a missing source (null field, fewer downstream assertions). Over-sampling from the SELECT step absorbs contacts where all collectors fail.

## Collector extensibility

Each evidence source has its own collector. Collectors are independent and produce a standard intermediate output per contact.

**Extensibility contract:** A collector must:
1. Produce a standard per-contact output with provenance metadata
2. Declare which `sources` tags it contributes (e.g., `"s3-recording"`, `"cloudwatch"`)

The assembler discovers available data per contact by what's present — it doesn't hard-code which collectors ran. Adding a new platform (Genesys, Twilio, a custom analytics pipeline) means writing a new collector. The assembler doesn't change.

This maps to canvas block 9, differentiation point 3: "Platform-extensible by design."

## PII handling

Recordings and transcripts contain caller data. The architecture enforces one rule: **no unredacted PII reaches any model.**

**Audio stays in place.** The framework never copies recordings out of the source S3 bucket — it stores URI references only. The audio remains under the customer's existing encryption, access control, and retention policies.

**PII redaction before model input.** What the framework can safely send to models depends on what's available in the customer's account:

| Tier | What's available | Audio → Gemini | Text → Bedrock |
|---|---|---|---|
| **1. Contact Lens** | Redacted audio + redacted transcripts | ✅ Send redacted audio | ✅ Send redacted transcript |
| **2. Comprehend only** | Text PII detection; no audio redaction | ❌ Audio blocked — skip voice quality scoring | ✅ Redact transcript via Comprehend before sending |
| **3. Custom pipeline (future)** | Transcribe → PII timestamps → silence audio segments | ✅ After custom redaction | ✅ Redact transcript before sending |

**MVP constraint:** Contact Lens is a prerequisite for voice quality scoring. Without it, the framework still runs text-based assertions (with transcripts redacted via Comprehend), but audio is not sent to any model. This is a gate, not a warning — the eval runner skips `voice_quality` assertions when redacted audio is unavailable.

## Unified test case schema

Every test case uses the same schema regardless of origin. Fields are nullable — the block fills in what it can, leaves the rest null.

```
TEST CASE
├── test_case_id
├── spec_version          (nullable — hash linking to Terraform spec)
├── sources[]             (which sources are present)
├── scenario
│   ├── description
│   ├── category          (happy-path, edge-case, adversarial)
│   ├── target_path       (nullable — needs Terraform)
│   └── caller_turns[]
├── evidence
│   ├── contact_id        (nullable)
│   ├── recording_uri     (nullable — needs S3)
│   ├── transcript        (nullable — needs Contact Lens)
│   └── execution_trace   (nullable — needs CloudWatch)
└── pii_flags             (from PII detection)
```

The `sources[]` field tells downstream capabilities what data is available. The eval runner uses this to decide which assertions to generate — that logic belongs to the eval runner architecture, not here.

## Partitioning: judge-calibration vs. eval

The LLM judge needs calibration examples — test cases with human scores that teach it what "good" and "bad" sound like. If those same cases appear in the eval set, the judge's scores aren't independent.

The assembler splits test cases into two non-overlapping sets:
- **Judge-calibration** — Few-shot examples with human scores (from the eval UI)
- **Eval** — Scored by the LLM judge; results measured for run-to-run consistency (G-11)

The split, sampling strategy, and random seed are recorded for reproducibility.

## Output

Each build produces an **immutable dataset snapshot**. Building with different parameters creates a new version, not an overwrite. The dataset contains:

- **Manifest** — provenance, sources used, sampling params, stats, PII summary
- **Spec model** — Terraform-extracted intent (flow paths, prompts, guardrails)
- **Test cases** — unified schema with evidence
- **Coverage analysis** — which spec paths are covered by the dataset
- **Partition map** — judge-calibration vs. eval assignment

## How this feeds downstream capabilities

| Canvas capability | What it consumes |
|---|---|
| **Scenario generator** | Spec model (paths, prompts, intents) + existing test cases (conversation patterns) + coverage gaps |
| **Eval runner** | Test cases with evidence and `sources[]` tags |
| **Voice quality scorer** | Recording URIs + transcripts |
| **Scorecard / reporting** | Manifest (provenance) + coverage (gap analysis) |
| **Human eval UI** | Recording URIs + transcripts for human reviewers to flag defects per turn |

## Design principles

| Principle | How it's applied |
|---|---|
| **Intent vs. evidence** | Terraform defines the spec (what should happen); runtime sources provide evidence (what did happen) |
| **Sample-before-collect** | Stratified sampling on cheap metadata before expensive collection — cost scales with sample size, not contact volume |
| **Data provenance** | Every artifact traces back to its source contact, flow version, and timestamp |
| **Train/eval separation** | Judge-calibration and eval sets never overlap |
| **Dataset versioning** | Immutable snapshots; new build = new version |
| **PII handling** | No unredacted PII reaches any model. Audio stays in source bucket; redaction tier determines what can be scored |
| **Graceful degradation** | Any source combination works; missing sources and collector failures produce null fields, not errors. Over-sampling absorbs total failures |
| **Batch execution** | Both steps process data in batches with checkpoint/resume; concurrency bounded per AWS service |
| **Size awareness** | Collection captures content size metadata so downstream can plan token budgets without re-reading artifacts |

## Open questions

1. **Terraform repo access** — Does the tool read from a local checkout or clone the repo?
2. **Flow version tracking** — Connect doesn't stamp the flow version on the contact record. How do we match which spec version served a given contact?
3. **Cross-account access** — Enterprise setups may have Connect, S3, and CloudWatch in different accounts. IAM implications for collection.
