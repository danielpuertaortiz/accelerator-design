---
artifact: accelerator-architecture
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 3 of 5
status: draft
updated: 2026-11-25
depends-on: [02-product-canvas]
---

# Architecture: AI Voice Testing Framework

## Overview

Four capabilities, each exposed as a skill that runs within Claude Code, Kiro, or similar AI-assisted dev tools. Under the hood, each skill orchestrates an agent workflow.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Data        │────▶│  Human Eval  │────▶│  Eval        │
│  Collection  │     │  Baseline    │     │  Runner      │
│  /build      │     │  /baseline   │     │  /run        │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
  golden dataset     human scores +        eval run results
  (calibration +     calibration data      (immutable)
   eval partitions)  (immutable)                │
                            │              ┌──────────────┐
                            └─────────────▶│  Score &     │
                                           │  Report      │
                                           │  /report     │
                                           └──────────────┘
                                                 │
                                            comparison
                                           human vs auto
```

**Skills, not standalone programs.** Each capability is a skill invoked within a dev tool — not a separate binary to install. The dev stays in their coding environment (Claude Code, Kiro) and runs `/build`, `/run`, `/baseline`, `/report`. Each skill orchestrates agents that have tool access to AWS services, models, and the local filesystem.

## Shared principles

| Principle | Applied everywhere |
|---|---|
| **Platform-agnostic** | Pluggable collectors, scorers, and assertion types. Connect is the first configuration, not a dependency |
| **Skills with agent workflows** | Each capability is a skill orchestrating agents under the hood. The dev interacts at the skill level |
| **Dev drives, AI assists** | AI is a tool for search, classification, scoring — the dev makes decisions |
| **PII at fetch time** | Metadata travels freely; content is PII-redacted the moment it's read |
| **Immutable outputs** | Datasets, eval runs, human scores — all versioned, never overwritten |
| **Graceful degradation** | Missing evidence → fewer assertions, not errors |

---

## 1. Data Collection (`/build`)

Builds the golden dataset from production artifacts. The dev runs the skill once at setup and occasionally on refresh.

### Starting from artifacts

The framework does not assume a metadata API or a specific platform. In the simplest case, all the team has is recordings in S3, transcripts in S3, and logs in CloudWatch. The framework collects metadata from these artifact locations, merges everything into a structured inventory, and lets the dev select cases.

### Evidence types

Three types, each optional — at least one must be present per conversation.

| Evidence type | What it answers |
|---|---|
| **Recording** | How did the agent *sound*? |
| **Transcript** | What did the agent *say*? |
| **Execution trace** | *How* did the agent process the request internally? |

### Collectors

Each evidence type has its own **collector** — an independent module that knows how to pull metadata for one type of artifact from one kind of source.

**Collector contract:**
1. Return a standard structured response per artifact
2. Declare which evidence type it contributes (`"recording"`, `"transcript"`, `"trace"`)
3. Support a date-range filter

**Collector response:**

```
COLLECTOR ITEM
├── conversation_id       (extracted via configured ID extraction)
├── evidence_type         ("recording" | "transcript" | "trace")
├── reference
│   ├── uri               (pointer, not content)
│   └── location_type     ("s3" | "cloudwatch" | "local")
├── metadata
│   ├── timestamp
│   ├── size_bytes
│   └── extra {}          (collector-specific)
└── collector             (provenance)
```

**Conversation ID extraction:** The correlation key comes from the artifact naming convention. Connect embeds a contact ID in S3 paths and CloudWatch log fields. Other setups may use filename prefixes, manifest files, or timestamp proximity.

### Pipeline

```
/build

┌─────────────────────────────────────────────────────────────────────┐
│ COLLECT  (automatic)                                               │
│  Collector agents run in parallel, one per source                   │
│  ──→ Structured items (references + metadata, not content)          │
├─────────────────────────────────────────────────────────────────────┤
│ MERGE  (automatic)                                                 │
│  Correlate items by conversation ID                                 │
│  ──→ Conversation inventory                                         │
├─────────────────────────────────────────────────────────────────────┤
│ INVENTORY  (interactive)                                           │
│  Dev browses, searches, selects conversations for golden dataset    │
│  AI available as tool: search transcripts, classify, surface        │
│  patterns — dev drives, AI assists                                  │
│  ──→ Selection with tags (category, scenario label, notes)          │
├─────────────────────────────────────────────────────────────────────┤
│ SNAPSHOT  (automatic)                                              │
│  Fetch full evidence, PII redaction, assemble, partition            │
│  ──→ Immutable dataset version                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Agents:**

| Agent | Role | Tools |
|---|---|---|
| Collector agents (parallel) | Scan artifact locations, return structured items | S3 ListObjects, CloudWatch DescribeLogStreams, Connect SearchContacts |
| Inventory agent (interactive) | Present inventory, fetch and PII-redact transcripts on demand | S3 GetObject, Comprehend (PII) |
| Snapshot agent | Fetch full evidence, assemble test cases, partition | S3 GetObject, CloudWatch GetLogEvents, Comprehend (PII) |

**Collect** is a lightweight metadata listing — paginated calls, completes in seconds. Standard retry (3 retries, exponential backoff). Failed collectors produce partial entries, not errors.

**Merge** groups items by conversation ID using a configured **correlation strategy** (path-based ID, manifest file, timestamp proximity, or filename prefix).

**Inventory** is the interactive step. The dev selects and tags conversations. AI can search transcripts and classify on demand — each transcript PII-redacted at fetch time.

**Snapshot** fetches full evidence for selected conversations only, applies PII redaction, assembles into the unified test case schema, and partitions into calibration vs. eval sets (see below).

**Refresh:** The dev runs `/build` again. Collect and merge show the delta — new conversations since last build.

### Dataset partitioning: calibration vs. eval

The LLM judge needs few-shot calibration examples — conversations with human-scored defects that show the model what "good" and "bad" look like. If those same cases also appear in the eval set, the judge's scores on them aren't independent.

Two non-overlapping sets, assigned at snapshot time:

| Set | Purpose | Scored by |
|---|---|---|
| **Calibration** | Few-shot examples included in the scoring prompt. Teach the LLM judge what defects look like and how to score them. | Human (via `/baseline`) |
| **Eval** | Scored by the automated eval runner. Results compared against the human baseline for validation. | Automated (via `/run`) + human sample (via `/baseline`) |

The calibration set is small — a handful of conversations per defect type, enough for few-shot context without consuming too much of the model's context window. The eval set is everything else.

Split and random seed recorded in the dataset manifest for reproducibility. The dev can override assignment during inventory if they know a conversation is a particularly good calibration example.

### Test case schema

```
TEST CASE
├── test_case_id
├── origin                (curated | generated)
├── available_sources[]   ("recording", "transcript", "trace")
├── scenario
│   ├── description
│   ├── category          (happy-path, edge-case, adversarial)
│   ├── scenario_label
│   ├── notes             (nullable)
│   └── caller_turns[]    (nullable — generated scenarios only)
├── evidence
│   ├── conversation_id   (nullable)
│   ├── recording_uri     (nullable)
│   ├── transcript        (nullable — PII-redacted)
│   └── execution_trace   (nullable)
├── size_metadata         (word count, duration, event count)
├── partition              (calibration | eval)
├── pii_redaction_tier
└── provenance
```

### Size tracking

Collectors capture size metadata so downstream capabilities can plan token budgets:

| Tracked | Why it matters downstream |
|---|---|
| Transcript word count | Eval runner batches within model context windows |
| Audio duration (seconds) | Voice scorer estimates Gemini input cost; long recordings may need chunking |
| Trace event count | Eval runner decides whether to summarize or pass full trace |

---

## 2. Eval Runner (`/run`)

Takes the golden dataset and scores each test case through the appropriate models. This is what the dev runs after changing a prompt — it produces the automated scores.

### How it works

```
/run --dataset v3

┌─────────────────────────────────────────────────────────────────────┐
│ PLAN  (automatic)                                                  │
│  Read dataset manifest                                              │
│  For each test case, determine which assertions to run based on     │
│  available_sources[]                                                │
│  ──→ Execution plan (which scorers, which test cases)               │
├─────────────────────────────────────────────────────────────────────┤
│ SCORE  (automatic — parallel per test case)                        │
│  Scorer agents execute assertions against models                    │
│  Audio → Gemini (voice quality)                                     │
│  Transcript + trace → Bedrock (text assertions)                     │
│  ──→ Per-test-case scores and verdicts                              │
├─────────────────────────────────────────────────────────────────────┤
│ RESULTS  (automatic)                                               │
│  Aggregate scores, compute pass/fail, detect regressions            │
│  ──→ Immutable eval run record                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Assertion types

The eval runner doesn't guess what to check — it looks at `available_sources[]` per test case and runs matching assertions.

| Assertion type | Requires | Scored by | What it checks |
|---|---|---|---|
| **Voice quality** | recording + transcript | Gemini (audio input) | Pronunciation, timing, cadence, tone, conversational quality |
| **Response accuracy** | transcript | Bedrock | Did the agent give correct information? |
| **Guardrail compliance** | transcript | Bedrock | Did the agent stay within configured guardrails? |
| **Handoff quality** | transcript + trace | Bedrock | Was the escalation to a human agent appropriate and smooth? |
| **Flow correctness** | trace | Bedrock | Did the agent follow the expected execution path? |
| **Knowledge base usage** | trace | Bedrock | Did the agent query the knowledge base when it should have? |

Assertion types are extensible — new types can be added without changing the runner's core logic.

### Calibration examples in the scoring prompt

The runner loads the **calibration set** from the dataset — conversations with human-scored defects — and includes them as few-shot examples in the scoring prompt. This anchors the LLM judge: "here's what a pronunciation defect looks like, here's how a human scored it." Only eval-set cases are actually scored; calibration cases are context, not inputs.

### Hybrid model split (G-07, G-15)

- **Gemini** handles audio evaluation — it's the only model that can interpret voice quality directly from audio. Called via Google's API, passing the recording + calibration examples.
- **Bedrock** handles all text-based assertions — response accuracy, guardrails, flow correctness. Called via AWS Bedrock API + calibration examples.

The runner manages both API calls per test case. If a test case has no recording (`audio_blocked` or missing), voice quality assertions are skipped — the test case is still scored on text assertions.

### Scoring rubric

Each assertion produces a structured score:

```
ASSERTION RESULT
├── assertion_type
├── verdict               (pass | fail | inconclusive)
├── score                 (0.0–1.0)
├── evidence              (which turns/events the scorer examined)
├── explanation           (model's reasoning — for debugging, not display)
└── model_metadata        (model ID, token usage, latency)
```

### Eval run record

Each `/run` invocation produces an immutable record:

```
EVAL RUN
├── run_id
├── dataset_version       (which golden dataset was used)
├── timestamp
├── config                (model versions, assertion types, rubric version)
├── results[]             (one per test case — all assertion results)
├── summary
│   ├── pass_rate         (overall and per assertion type)
│   ├── by_category       (pass rate per scenario category)
│   └── by_scenario_label (pass rate per scenario label)
└── cost                  (total tokens, API calls, estimated spend)
```

### Token budget management

The runner uses the size metadata from data collection to stay within model context windows:

- **Transcript batching** — if a transcript exceeds the model's context window, the runner chunks it by conversation turns and scores each chunk, merging results
- **Trace summarization** — if a trace has too many events, the runner summarizes before sending to the model
- **Audio chunking** — recordings longer than Gemini's input limit are split into segments; voice quality scores are averaged across segments

### Cost controls

- Configurable concurrency per model API (Gemini, Bedrock) — conservative defaults to avoid quota issues
- Dry-run mode: plan assertions without calling models — shows what would run and estimated cost
- Per-run token budget: the runner stops if cumulative token usage exceeds the configured limit

---

## 3. Human Eval Baseline (`/baseline`)

Human reviewers score conversations from the golden dataset. This serves two distinct purposes:

1. **Calibration set** — human scores on calibration-partition cases become the few-shot examples that teach the LLM judge what defects look like. These are scored first, before any automated eval runs.
2. **Comparison baseline** — human scores on a sample of eval-partition cases become the ground truth to compare against automated results. If the automated eval passes a conversation a human would fail, that's a false negative. If it fails one the human would pass, that's a false positive.

The reviewer doesn't need to know which partition a conversation belongs to — the skill presents conversations and collects scores either way.

### How it works

```
/baseline --dataset v3

┌─────────────────────────────────────────────────────────────────────┐
│ PRESENT  (interactive)                                             │
│  Show conversation to reviewer: transcript turn by turn,            │
│  play recording if available                                        │
│  ──→ Reviewer reads/listens                                         │
├─────────────────────────────────────────────────────────────────────┤
│ SCORE  (interactive)                                               │
│  Reviewer flags defects per turn:                                   │
│    wrong info, pronunciation issue, awkward handoff,                │
│    guardrail violation, hallucination, timing issue, etc.           │
│  ──→ Per-turn defect flags + overall conversation verdict           │
├─────────────────────────────────────────────────────────────────────┤
│ RECORD  (automatic)                                                │
│  Save human scores as immutable baseline version                    │
│  ──→ Human baseline record                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### What the reviewer sees

This is a CLI-driven experience, same environment as `/build` and `/run`. For each conversation:

1. **Transcript displayed turn by turn** — PII-redacted, with turn numbers and speaker labels (caller / agent)
2. **Recording playable** — if available and audio is not PII-blocked
3. **Reviewer flags defects** — per turn, selecting from a defect taxonomy (wrong info, pronunciation, timing, guardrail, hallucination, handoff, other)
4. **Overall verdict** — pass / fail for the conversation, with optional notes

The AI can assist: "highlight turns where the agent might have pronunciation issues" — but the human makes the final judgment. This is the ground truth.

### Defect taxonomy

| Defect type | What it means | Example |
|---|---|---|
| **Wrong information** | Agent gave factually incorrect response | Wrong price, wrong policy |
| **Pronunciation** | Agent mispronounced a word, number, or name | "3,445" read as "three, four, four, five" |
| **Timing** | Awkward pause, too fast, interrupted the caller | 5-second silence before responding |
| **Guardrail violation** | Agent responded to something it shouldn't have | Answered an off-topic question |
| **Hallucination** | Agent fabricated information not in the knowledge base | Invented a hotel amenity |
| **Handoff** | Escalation to human was awkward or unnecessary | Transferred without explanation |
| **Persona** | Tone, empathy, or accent doesn't match the configured persona | Too formal for a casual brand |

### Human baseline record

```
HUMAN BASELINE
├── baseline_id
├── dataset_version       (same dataset the eval runner uses)
├── reviewer              (who scored — for inter-rater tracking)
├── timestamp
├── scores[]              (one per conversation)
│   ├── test_case_id
│   ├── verdict           (pass | fail)
│   ├── defects[]         (per-turn defect flags)
│   └── notes             (nullable)
└── summary
    ├── defect_rate       (flagged turns / total turns)
    └── by_defect_type    (counts per defect type)
```

### Not full coverage

The human doesn't score every conversation in the golden dataset — that would bring us back to the manual testing problem. A sample is enough for validation. Even 20–30 conversations scored by a human gives a meaningful comparison against the automated eval.

---

## 4. Score & Report (`/report`)

Surfaces results and comparisons. This is where the dev sees whether their prompt change helped or hurt.

### Three views

**Run summary** — results from a single `/run` invocation:
- Overall pass rate and score distribution
- Pass rate per scenario category and label
- Failing test cases with assertion details and model explanations
- Cost summary (tokens, API calls, estimated spend)

**Run comparison** — diff between two eval runs (e.g., before and after a prompt change):
- Which test cases flipped (pass → fail or fail → pass)
- Score deltas per assertion type
- Regressions and improvements by scenario category
- "This prompt change improved number pronunciation (+3 passing) but regressed escalation handling (−1 passing)"

**Human vs. automated** — comparison between human baseline and eval run on overlapping test cases:
- Agreement rate: how often human and automated verdicts match
- False negatives: automated passed, human failed — the framework missed a real defect
- False positives: automated failed, human passed — the framework was too strict
- Disagreement details: which test cases, which assertion types, which turns
- This is the validation that the automated eval is trustworthy (G-11)

### How it works

```
/report                              → latest run summary
/report --run <run-id>               → specific run summary
/report --compare <run-a> <run-b>    → run comparison
/report --validate <run-id> <baseline-id>  → human vs. automated
```

The report is generated by an agent that reads the eval run records and human baseline records, computes the comparisons, and presents results in the terminal. No separate dashboard infrastructure needed for MVP.

### Report record

Each report is also an immutable artifact — stored for trend tracking:

```
REPORT
├── report_id
├── type                  (summary | comparison | validation)
├── inputs                (run IDs, baseline IDs used)
├── timestamp
├── results               (the computed metrics and comparisons)
└── provenance
```

---

## PII handling (cross-cutting)

**Rule: no unredacted PII reaches any model or AI tool.**

| When | What happens |
|---|---|
| **Data collection** | Collect pulls metadata only. Content PII-redacted at fetch time. |
| **Eval runner** | Receives PII-redacted content from the dataset. Models never see raw PII. |
| **Human baseline** | Reviewer sees PII-redacted transcripts and hears redacted audio (if Contact Lens). |
| **Reporting** | Works on scores and verdicts, not raw content. No PII. |

**Redaction tiers:**

| Tier | Transcript | Audio |
|---|---|---|
| **Full audio + text** (e.g., Contact Lens) | Pre-redacted transcript | Redacted audio available for voice scoring |
| **Text only** (e.g., Comprehend) | Redact via Comprehend at fetch | Audio blocked — skip voice quality scoring |
| **None** | Blocked until PII pipeline configured | Audio blocked |

Comprehend's 100 KB input limit means oversized transcripts are chunked before detection, results merged.

---

## End-to-end flow

**Initial setup** (once per dataset version):

```
1. /build                      Build golden dataset (collect → merge → inventory → snapshot)
                                Partitions cases into calibration and eval sets

2. /baseline --dataset v3      Human scores calibration cases (few-shot examples for LLM judge)
                                Also scores a sample of eval cases (comparison baseline)
```

**Inner loop** (every prompt change):

```
3. /run --dataset v3           Run automated eval — calibration cases included as few-shot
                                context, eval cases scored
                                (seconds to minutes depending on dataset size)

4. /report                     See results — did the change help or hurt?

5. /report --compare v3-run-1 v3-run-2
                                Compare before and after the prompt change
```

**Periodic maintenance:**

```
6. /report --validate v3-run-2 baseline-1
                                Check: does the automated eval agree with the human?

7. /build                      Refresh golden dataset with new production conversations
   /baseline --dataset v4      Score new calibration cases + eval sample
```

Steps 3–5 are the fast loop. Steps 6–7 are occasional — when the dev wants to validate the automated eval or bring in fresh data.

---

## Open questions

1. **Cross-account access** — IAM implications when Connect, S3, and CloudWatch live in different accounts.
2. **Mixed-source datasets** — Can a single golden dataset mix conversations from different collectors or correlation strategies?
3. **Inter-rater reliability** — When multiple humans score the baseline, how do we measure agreement?
4. **Gemini latency and cost** — Audio evaluation via Gemini API: what's the per-recording latency and cost at 50–200 recordings per run?
5. **Assertion extensibility** — How does a team add a custom assertion type (e.g., compliance-specific checks)?

## Future extensions

- **Stratified sampling** — automated dataset refresh for high-volume production
- **Terraform integration** — coverage analysis and spec-driven scenario generation
- **Scenario generator** — automatically derive new test scenarios from existing conversation patterns
- **CI/CD integration** — run eval automatically on prompt changes in a pipeline
- **Trend dashboard** — historical view of eval scores across agent versions (beyond the CLI report)
