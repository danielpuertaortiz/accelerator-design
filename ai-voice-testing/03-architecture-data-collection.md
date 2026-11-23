---
artifact: accelerator-architecture-data-collection
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 3 of 5
status: draft
updated: 2026-11-20
depends-on: [02-product-canvas]
feeds: [scenario-generator, eval-runner, voice-quality-scorer, scorecard, human-eval-ui]
---

# Architecture: Data Collection Block

## Context

Every downstream capability in the canvas — scenario generation, eval runner, voice scoring, reporting, human eval UI — needs data before it can work. Today that data lives in three disconnected places and devs access it manually: hand-dialing calls, clicking through the Connect console, copy-pasting CloudWatch logs into Miro (Julian interview). The data collection block is the first piece of architecture because everything else depends on it.

## The three-source model

The key insight: **Terraform is not just infrastructure — it's a data source.** It contains the specification of the agent's intended behavior. Combined with runtime data from S3 and CloudWatch, it forms a three-legged stool:

| Source | Role | What it answers | Required? |
|---|---|---|---|
| **Terraform** | Intent | What is the agent *configured* to do? | Optional |
| **S3 recordings** | Outcome (audio) | How did the agent *sound*? | Optional |
| **S3 transcripts** | Outcome (text) | What did the agent *say*? Requires Contact Lens. | Optional |
| **CloudWatch** | Execution | *How* did the agent process the request internally? | Optional |

**All sources are optional, but at least one must be present.** The architecture is designed for extensibility — adding a new source (e.g., a different voice platform, a conversation analytics tool, a custom logging pipeline) means writing a new collector that outputs the same intermediate format into `raw/`, and registering the assertion types it enables. The correlator and assembler don't change.

The test cases the block produces are only as rich as the sources available. The more sources, the more assertion types are possible:

| Available sources | What you can test |
|---|---|
| Terraform only | Generate scenarios from the spec (path coverage, prompt catalog). No evidence — eval runner must execute them. |
| S3 recordings only | Voice quality scoring on audio. No transcript, no execution trace, no spec to compare against. |
| S3 recordings + transcripts | Voice quality + text-level assertions (intent, data correctness, guardrails). |
| Terraform + S3 + CloudWatch | Full picture — voice quality + text + path match + execution trace + coverage analysis. |
| Any combination in between | Graceful degradation — the block fills in what it can, leaves the rest null. |

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  STEP 1: COLLECT  (slow — AWS API calls, run once per collection)
│                                                                         │
  ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐
│ │  TERRAFORM   │   │     S3      │   │   CLOUDWATCH     │               │
  │  (Intent)    │   │  (Outcome)  │   │   (Execution)    │
│ │              │   │             │   │                   │               │
  │ Flow defs    │   │ Recordings  │   │ Flow exec logs   │
│ │ Agent config │   │ Transcripts │   │ Lambda logs      │               │
  │ KB bindings  │   │ Contact     │   │ Bedrock logs     │
│ │ Guardrails   │   │  metadata   │   │ Error traces     │               │
  │ Lambda assoc │   │             │   │ Timing data      │
│ │ Lex intents  │   │             │   │                   │               │
  └──────┬───────┘   └──────┬──────┘   └────────┬─────────┘
│        │                  │                    │                         │
         ▼                  ▼                    ▼
│ ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐               │
  │  TF PARSER  │   │ S3 COLLECTOR│   │  CW COLLECTOR    │
│ │             │   │             │   │                   │               │
  │ Parse HCL/  │   │ List by     │   │ Logs Insights    │
│ │ JSON flows  │   │ date/flow/  │   │ query by         │               │
  │ → spec model│   │ outcome     │   │ contact IDs      │
│ └──────┬───────┘   └──────┬──────┘   └────────┬─────────┘               │
         │                  │                    │
│        ▼                  ▼                    ▼                         │
  ┌─────────────┐   ┌──────────────────────────────────┐
│ │ spec/       │   │ raw/                             │                  │
  │  spec-      │   │  <contact-id>/                   │
│ │  model.json │   │    recording.wav  ← S3 URI ref   │                  │
  │  flow-      │   │    transcript.json               │
│ │  def.json   │   │    execution-trace.json          │                  │
  └─────────────┘   │    provenance.json ← source tags │
│                    └──────────────────────────────────┘                  │
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

                             │
                             ▼

┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  STEP 2: ASSEMBLE  (fast — local, re-runnable with different params)
│                                                                         │
  ┌──────────────────┐
│ │  CORRELATOR      │                                                    │
  │                  │
│ │  Join raw/ per   │                                                    │
  │  contact ID +   │
│ │  spec version    │                                                    │
  └────────┬─────────┘
│          │                                                              │
           ├──→ Apply stratified sampling (by intent, outcome, path)
│          ├──→ Partition into judge-calibration vs. eval sets             │
           ├──→ Compute path coverage against spec
│          ├──→ Flag PII presence from Contact Lens categories            │
           │
│          ▼                                                              │
  ┌──────────────────────────────────────────┐
│ │  datasets/hotel-booking-2026-11-15/      │                            │
  │    manifest.json                         │
│ │    spec/                                 │                            │
  │      spec-model.json                     │
│ │      flow-definition.json                │                            │
  │    test-cases/                           │
│ │      tc-hotel-047.json  (with evidence)  │                            │
  │      tc-hotel-048.json  (with evidence)  │
│ │      ...                                 │                            │
  │    coverage.json                         │
│ │    partitions.json                       │                            │
  └──────────────────────────────────────────┘
│                                                                         │
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
```

### Why two steps

| Concern | One step | Two steps |
|---|---|---|
| Re-run with different sampling | Re-collects from AWS every time | Re-assembles locally in seconds |
| Change train/eval partition | Re-collects from AWS every time | Re-assembles locally |
| Cost | AWS API calls on every iteration | API calls once, iterate cheaply |
| Debugging | Hard to tell if a problem is collection or assembly | Each step's output is inspectable |
| Composability | Monolithic | Step 1 output is reusable by other tools |

## Source 1: Terraform (Intent)

### What lives here
The Terraform repo that manages the Connect instance contains the **specification** of the agent's intended behavior:

- **`aws_connect_contact_flow`** — The flow definition JSON. This is the core artifact: every possible conversation path, condition, prompt, and action. The JSON may be inline in the HCL or referenced as a separate file.
- **`aws_connect_bot_association`** / Lex resources — Intent models, slot types, sample utterances. What the agent can understand.
- **`aws_lambda_function`** + **`aws_connect_lambda_function_association`** — Business logic the agent invokes. The Lambda code may live in a separate repo, but the association tells us *which* Lambdas the flow calls and *when*.
- **Bedrock agent/KB configurations** — If using Connect's newer agentic features: agent instructions, knowledge base bindings, tool definitions, guardrail configurations.
- **Queue/routing configs** — Handoff conditions, escalation paths, hours of operation.

### What the parser produces
A **specification model** — a structured representation of:
1. **Path graph** — Every possible route through the flow (decision branches, loops, error paths, handoffs)
2. **Prompt catalog** — Every text/SSML prompt the agent can speak, with the conditions that trigger each
3. **Intent map** — Lex intents and their utterance patterns
4. **Action inventory** — Lambda calls, KB queries, queue transfers, and the flow conditions that trigger them
5. **Guardrail rules** — What the agent is constrained from doing/saying
6. **Version fingerprint** — A hash of the flow definition + associated resources, so we can track which spec version a contact was served by

### Parser depth (MVP decision)
- **Shallow** (recommended for MVP): Parse flow definitions + resource association mapping (which Lambdas, which KBs, which Lex bots). The flow JSON alone is rich enough to generate scenarios and define expected paths.
- **Deep** (future): Also resolve Lambda code, KB content, Lex training data. Gives a complete picture but requires access to multiple repos/services.

## Source 2: S3 (Outcome)

### What lives here
Amazon Connect stores runtime artifacts in S3 buckets configured at the instance level:

- **Call recordings** — Audio files (WAV), per contact ID. Path: `connect/<instance>/<date>/<contact-id>.wav`
- **Transcripts** — If Contact Lens is enabled: JSON with turn-by-turn transcription, sentiment, detected issues, categories. Path: `Analysis/Voice/<date>/<contact-id>/*.json`
- **Contact metadata** — Available via Connect API (`GetContactAttributes`, `DescribeContact`) and within Contact Lens analysis files.

### What the collector produces
Per-contact runtime records:
1. **Recording URI** — S3 path to the audio (referenced, not downloaded — downstream consumers fetch as needed)
2. **Transcript (structured)** — Parsed into turns: `[{speaker, text, timestamp, sentiment, ...}, ...]`
3. **Contact metadata** — Duration, queue, flow name, outcome (completed/transferred/abandoned)
4. **Contact Lens analysis** — If available: detected issues, categories, loudness scores, interruptions, talk time ratios

### Collection parameters
- **Date range** — "Last 7 days" or explicit range
- **Flow** — Filter to a specific contact flow
- **Outcome** — Completed, transferred to human, abandoned
- **Duration** — Filter out hang-ups and misdials (e.g., >2 minutes)
- **Sampling** — Random N or stratified by intent/outcome

## Source 3: CloudWatch (Execution)

### What lives here
- **Contact flow logs** — Step-by-step execution per contact (if enabled). Log group: `/aws/connect/<instance-name>`
- **Lambda execution logs** — What business logic received and returned
- **Bedrock model invocation logs** — Prompts, responses, token usage, latency (if agentic features with logging)
- **Lex logs** — Intent recognition results, slot filling, confidence scores

### What the collector produces
Per-contact execution traces:
1. **Flow execution path** — Ordered sequence of flow blocks executed, with timestamps. The "actual path" to compare against the spec's "possible paths."
2. **Decision log** — At each branch: condition evaluated, value, branch taken
3. **External call results** — Lambda responses, KB query results, Lex confidence scores
4. **Error events** — Failed/timed-out blocks, error paths taken
5. **Timing breakdown** — Per-step latency (model inference, Lambda cold start, KB retrieval)

### Collection approach
CloudWatch Logs Insights queries, filtered by contact IDs from the S3 collector (shared join key).

## Step 1: Collect

Runs once per collection. Talks to AWS, produces intermediate files. Slow and costs API calls.

### Collectors

Each source has its own collector. Collectors are independent — they run in isolation and produce a standard intermediate output. Adding a new source means writing a new collector; nothing else changes.

| Collector | Input | Output | Can run without the others? |
|---|---|---|---|
| **TF Parser** | Local Terraform checkout | `spec/spec-model.json`, `spec/flow-definition.json` | Yes |
| **S3 Collector** | S3 bucket + collection params | Per-contact: `recording-uri.txt`, `transcript.json`, `provenance.json` | Yes |
| **CW Collector** | CloudWatch log groups + contact IDs | Per-contact: `execution-trace.json` | Needs contact IDs (from S3 collector or passed explicitly) |

**Extensibility contract:** A collector must produce files under `raw/` following the intermediate output structure below. It declares which `sources` tag it contributes (e.g., `"s3-recording"`, `"cloudwatch"`) and which assertion types its data enables. The assembler in Step 2 discovers available data per contact by what files are present — it doesn't hard-code which collectors ran.

Future collectors (examples):
- **Genesys collector** — Same role as S3 collector, different platform. Produces the same per-contact intermediate files from Genesys recording/transcript APIs.
- **Twilio collector** — Same pattern for Twilio Flex recordings and logs.
- **Custom analytics collector** — Ingests output from a third-party conversation analytics tool (e.g., sentiment, topic detection) as additional evidence fields.

**Collector registry (future skill)** — As collectors grow beyond the initial Connect set, a separate skill will be needed to list available collectors, scaffold new ones from a template, and validate they conform to the extensibility contract (correct output structure, declared source tags, assertion type mappings). Not needed for MVP — design it once we have at least two platform collectors and understand the real registration surface.

This maps directly to canvas block 9, differentiation point 3: "Platform-extensible by design — Connect is the beachhead, but the architecture separates platform-specific adapters from platform-agnostic capabilities."

### Intermediate output
```
raw/
  spec/
    spec-model.json
    flow-definition.json
  contacts/
    <contact-id>/
      provenance.json         ← contact ID, flow, timestamp, outcome, source bucket/log group
      transcript.json         ← structured turns from Contact Lens
      execution-trace.json    ← structured flow path from CloudWatch
      recording-uri.txt       ← S3 path (not the audio itself)
  collection-params.json      ← query parameters used, for reproducibility
```

Each contact directory is self-contained. `provenance.json` tags every artifact with contact ID, flow version, timestamp, and outcome — without this, you can't trace a failing eval back to the call that produced it (**data provenance**).

### PII handling
Connect recordings and transcripts contain caller data. Step 1:
- Flags contacts where Contact Lens detected PII categories (names, account numbers, SSNs)
- Records the account's S3 lifecycle/retention policy in `collection-params.json`
- Does not copy recordings out of the source bucket — only references URIs. The audio stays where the account's encryption and retention policies already govern it.

## Step 2: Assemble

Runs locally on Step 1's output. Fast, cheap, re-runnable with different parameters.

### What it does
1. **Correlate** — Joins each contact's transcript, execution trace, and recording URI into a single eval record, linked to the spec via flow version
2. **Sample** — Applies stratified sampling so the dataset covers the distribution that matters, not just "last N calls" (**stratified sampling**)
3. **Partition** — Splits test cases into `judge-calibration` and `eval` sets. Cases in the calibration set become few-shot examples for the LLM judge; cases in the eval set are scored independently. These must not overlap (**train/eval separation**)
4. **Derive** — Computes path coverage, untested branches, and anomalies against the spec
5. **Snapshot** — Produces an immutable dataset with a manifest listing every artifact, its source, and the assembly parameters (**dataset versioning**)

### Join keys
- **Contact ID** — Links S3 artifacts to CloudWatch logs
- **Flow version** — Links the Terraform spec to runtime data. Options: deploy timestamps matched against contact timestamps, flow ARN + version from CloudWatch, or a custom contact attribute set by the flow

### Partitioning: judge-calibration vs. eval
The LLM judge needs calibration examples — test cases with human scores that teach it what "good" and "bad" sound like on the rubric (pronunciation, timing, cadence, tone). If those same cases appear in the eval set, the judge's scores on them aren't independent.

```
                    ┌─────────────────────┐
                    │  All test cases     │
                    │  with evidence      │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
          ┌─────────▼──────────┐  ┌───────▼────────────┐
          │ judge-calibration  │  │ eval               │
          │                    │  │                    │
          │ Few-shot examples  │  │ Scored by the LLM  │
          │ for the LLM judge. │  │ judge. Results     │
          │ Need human scores  │  │ scored multiple    │
          │ (from eval UI).    │  │ times to measure   │
          │                    │  │ run-to-run         │
          │                    │  │ consistency (G-11). │
          └────────────────────┘  └────────────────────┘
```

`partitions.json` records which test case IDs belong to which set, plus the sampling strategy and random seed used, so the split is reproducible.

## Unified test case schema

Every test case uses the same schema regardless of origin. Fields are nullable — the block fills in what it can from the available sources, and leaves the rest null. The eval runner and scorer adapt based on what's present.

```
┌──────────────────────────────────────────────────────────────┐
│                        TEST CASE                             │
│                                                              │
│  test_case_id    ← unique identifier                         │
│  flow            ← which Connect flow (null if no Terraform) │
│  spec_version    ← hash linking to Terraform spec (nullable) │
│  sources         ← ["terraform","s3-recording","s3-transcript│
│                      ","cloudwatch"] — which sources present │
│                                                              │
│  scenario: {                       ← always present          │
│    description                                               │
│    category        (happy-path, edge-case, adversarial)      │
│    target_path     (nullable — needs Terraform)              │
│    caller_turns: [                                           │
│      {after, utterance, behavior}                            │
│    ]                                                         │
│  }                                                           │
│                                                              │
│  evidence: {                       ← null or partially filled│
│    contact_id      (nullable)                                │
│    recording_uri   (nullable — needs S3 recordings)          │
│    transcript      (nullable — needs Contact Lens)           │
│    execution_trace (nullable — needs CloudWatch)             │
│  }                                                           │
│                                                              │
│  assertions: [                     ← auto-generated based    │
│    {type, expect/rubric/rules}       on available sources    │
│  ]                                                           │
└──────────────────────────────────────────────────────────────┘
```

### Assertions adapt to available sources

The assembler only generates assertions that the available evidence can support:

| Assertion type | Requires |
|---|---|
| `path_completion` | Terraform (spec) + CloudWatch (execution trace) |
| `path_match` | Terraform (spec) + CloudWatch (execution trace) |
| `voice_quality` | S3 recording. ⚠️ **G-13/G-15:** Nova Sonic 2.5 (Bedrock) transcribes before interpreting — cannot evaluate audio directly. Requires Google Gemini or equivalent multimodal model with direct audio interpretation. See hybrid architecture decision. |
| `intent_persistence` | CloudWatch (Lex logs) or S3 transcript |
| `data_correctness` | S3 transcript or CloudWatch (execution trace) |
| `guardrail_compliance` | Terraform (guardrail rules) + S3 transcript |
| `timing` | CloudWatch (execution trace) |

A test case with only S3 recordings gets `voice_quality` assertions and nothing else. A test case with Terraform + CloudWatch but no recording gets path and timing assertions but no voice scoring. The schema is the same — the content scales with what's available.

### Example test case
```json
{
  "test_case_id": "tc-hotel-047",
  "flow": "hotel-booking",
  "spec_version": "sha256:a1b2c3",

  "scenario": {
    "description": "Caller books a room, interrupts during date confirmation, corrects to Saturday",
    "category": "edge-case/interruption",
    "target_path": "greeting → intent_capture → date_lookup → date_correction → confirmation → farewell",
    "caller_turns": [
      {"after": "greeting",        "utterance": "I need a room for Friday night"},
      {"after": "date_lookup",     "utterance": "— wait, actually make that Saturday", "behavior": "interrupts mid-response"},
      {"after": "date_correction", "utterance": "Yes, that's right"}
    ]
  },

  "evidence": {
    "contact_id": "abc-123-def",
    "recording_uri": "s3://acme-recordings/.../abc-123-def.wav",
    "transcript": [
      {"turn": 1, "speaker": "AGENT",    "text": "Welcome to the Grand Hotel...",           "ts": 0.0},
      {"turn": 2, "speaker": "CUSTOMER", "text": "I need a room for Friday night",          "ts": 3.2},
      {"turn": 3, "speaker": "AGENT",    "text": "I have a room for Friday November...",     "ts": 5.8},
      {"turn": 4, "speaker": "CUSTOMER", "text": "— wait, actually make that Saturday",     "ts": 8.1},
      {"turn": 5, "speaker": "AGENT",    "text": "Updated to Saturday. Shall I confirm?",   "ts": 9.4},
      {"turn": 6, "speaker": "CUSTOMER", "text": "Yes, that's right",                       "ts": 12.1},
      {"turn": 7, "speaker": "AGENT",    "text": "Your reservation is confirmed for Saturday.", "ts": 13.4}
    ],
    "execution_trace": {
      "path_taken": "greeting → intent_capture → date_lookup → date_correction → confirmation → farewell",
      "decisions": [
        {"branch": "intent_capture", "condition": "lex_intent", "value": "book_room (0.94)"}
      ],
      "external_calls": [
        {"service": "lambda:check-availability", "input": {"date": "2026-11-22"}, "output": {"available": true}, "latency_ms": 180},
        {"service": "bedrock:kb-query", "input": "room availability Saturday", "results": 3, "latency_ms": 420}
      ],
      "errors": [],
      "timing": {"total_sec": 22, "model_ms": 840, "lambda_ms": 180}
    }
  },

  "assertions": [
    {"type": "path_completion",      "expect": "reaches farewell without handoff"},
    {"type": "intent_persistence",   "expect": "book_room intent survives interruption"},
    {"type": "data_correctness",     "expect": "final booking says Saturday, not Friday"},
    {"type": "voice_quality",        "rubric": ["pronunciation", "timing", "cadence", "interruption_recovery"]},
    {"type": "guardrail_compliance", "rules": ["no_pricing_without_auth"]}
  ]
}
```

### How the eval runner uses this

```
                          ┌──────────────┐
                          │  EVAL RUNNER  │
                          │              │
         ┌────────────────┤  For each    │
         │                │  test case:  │
         │                └──────┬───────┘
         │                       │
         ▼                       ▼
   evidence present?        evidence null?
   ┌─────────────┐         ┌─────────────┐
   │ YES — from  │         │ NO — from   │
   │ data        │         │ scenario    │
   │ collection  │         │ generator   │
   │             │         │             │
   │ Skip to     │         │ Execute     │
   │ assertions  │         │ scenario →  │
   │             │         │ fill in     │
   │             │         │ evidence    │
   └──────┬──────┘         └──────┬──────┘
          │                       │
          └───────────┬───────────┘
                      ▼
              Same assertion pipeline:
              evaluate each assertion
              against evidence
```

The eval runner doesn't branch on test case origin. It checks one thing: is `evidence` filled in? If yes, score. If no, execute, then score. Both paths converge into the same assertion pipeline.

## Output: eval dataset

### Structure
```
datasets/
  hotel-booking-2026-11-15-v1/
    manifest.json             ← immutable snapshot metadata + provenance
    spec/
      flow-definition.json    ← Terraform-extracted flow
      spec-model.json         ← parsed specification model
    test-cases/
      tc-hotel-047.json       ← unified test case (with evidence)
      tc-hotel-048.json
      ...
    coverage.json             ← which spec paths are covered
    partitions.json           ← judge-calibration vs. eval split
```

Each dataset is an **immutable snapshot**. Re-assembling with different parameters produces a new version (`-v2`), not an overwrite. The manifest records everything needed to understand what's in the dataset and reproduce it.

### Manifest schema
```json
{
  "dataset_id": "hotel-booking-2026-11-15-v1",
  "created": "2026-11-15T18:00:00Z",
  "immutable": true,
  "sources": {
    "terraform": {
      "repo": "github.com/acme/connect-infra",
      "commit": "a1b2c3d",
      "flow_resource": "aws_connect_contact_flow.hotel_booking"
    },
    "s3": {
      "bucket": "acme-connect-recordings",
      "prefix": "connect/instance-id/",
      "date_range": ["2026-11-01", "2026-11-15"],
      "filters": {"flow": "hotel-booking", "min_duration": 120}
    },
    "cloudwatch": {
      "log_groups": ["/aws/connect/acme-instance"],
      "query_hash": "sha256:..."
    }
  },
  "assembly": {
    "raw_collection": "raw/2026-11-15T18:00:00Z",
    "sampling": {"strategy": "stratified", "by": ["outcome", "intent"], "total": 47},
    "partitions": {
      "judge_calibration": 12,
      "eval": 35
    },
    "seed": 42
  },
  "stats": {
    "total_test_cases": 47,
    "with_evidence": 47,
    "duration_range": [120, 892],
    "outcomes": {"completed": 31, "transferred": 12, "abandoned": 4},
    "path_coverage": "14/23 branches covered",
    "pii_flagged": 8
  },
  "version": 1
}
```

## How this feeds downstream capabilities

| Canvas capability | What it consumes from this block |
|---|---|
| **Scenario generator** | `spec-model.json` (flow paths, prompts, intents) + test cases with evidence (real conversation patterns) + `coverage.json` (which paths need generated scenarios) |
| **Eval runner** | Test cases — executes those without evidence, scores all via assertions |
| **Voice quality scorer** | Called by the eval runner for `voice_quality` assertions — receives `evidence.recording_uri` + `evidence.transcript` |
| **Scorecard / reporting** | `manifest.json` (provenance) + `coverage.json` (gap analysis) + assertion results from the eval runner |
| **Human eval UI** | Test cases with evidence → recording URIs + transcripts for human evaluators to score |

## Eval practices built into this design

| Practice | Where it lives | Step |
|---|---|---|
| **Data provenance** | `provenance.json` per contact — contact ID, flow version, timestamp, outcome, source bucket/log group | Step 1 |
| **Stratified sampling** | Assembly supports filters by intent, outcome, duration, flow path — not just "last N calls" | Step 2 |
| **Train/eval separation** | `partitions.json` splits test cases into judge-calibration vs. eval sets; no overlap | Step 2 |
| **Dataset versioning** | Each assembly produces an immutable snapshot with a manifest; re-assembly creates a new version, not an overwrite | Step 2 |
| **PII handling** | Step 1 flags PII-containing contacts via Contact Lens categories; recordings stay in source bucket under existing encryption/retention policies; `pii_flagged` count in manifest | Step 1 |
| **Continuous collection** | Deferred — to be designed later as a scheduled pipeline (Lambda/EventBridge) for the post-MVP sampling loop (G-14) | Future |

## Open questions

1. **Terraform repo access pattern** — Does the skill read from a local checkout (natural for Claude Code) or clone the repo?

2. **Flow version tracking** — Connect doesn't stamp the flow version on the contact record. How do we match which spec version a contact was served by? Deploy timestamps, flow ARN versioning, or a custom contact attribute?

3. **Cross-account access** — Enterprise setups may have Connect, S3, and CloudWatch in different accounts. IAM implications for the collection pipeline.

4. **Data volume** — How many contacts per collection run? Affects whether this is interactive (skill) or batch (pipeline).

5. **One skill or two?** — Step 1 (collect) and Step 2 (assemble) have different concerns and run profiles. Options: two separate skills with explicit handoff, or one skill with subcommands (`collect`, `assemble`, `collect+assemble`). Two skills is cleaner for separation but adds friction; one skill with subcommands is more ergonomic for devs who just want a dataset.
