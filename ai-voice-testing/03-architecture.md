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
| **Immutable outputs** | Datasets, eval runs, human scores — all versioned, never overwritten. Stored locally (filesystem); cloud persistence (S3/DynamoDB) is a future extension |
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

**Merge** groups items by conversation ID using a configured **correlation strategy** (path-based ID, manifest file, timestamp proximity, or filename prefix). If two artifacts can't be correlated to the same conversation ID, they become separate conversations — each with partial evidence. No fuzzy matching or guessing.

**Inventory** is the interactive step. The dev selects and tags conversations. AI can search transcripts and classify on demand — each transcript PII-redacted at fetch time.

**Snapshot** fetches full evidence for selected conversations only, applies PII redaction, assembles into the unified test case schema, and partitions into calibration vs. eval sets (see below).

### Promoting production cases into the golden dataset

Production conversations land in the same S3 buckets and CloudWatch log groups the collectors already scan. There's no separate flagging mechanism — when the dev wants new test cases from production, they run `/build` again.

The collectors find all conversations since the last snapshot. Merge shows the delta — new conversations that aren't already in the dataset. The dev browses the new inventory, selects the cases worth adding (a tricky escalation that exposed a bug, a pronunciation edge case from a real caller), tags them, and snapshots. New version, immutable.

This means the golden dataset grows organically from production without a separate promotion pipeline. The same skill, the same collectors, the same interactive flow. The only difference is intent: the first `/build` creates the dataset from scratch; subsequent runs extend it with fresh production data.

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

### PII in the collection pipeline

Each phase handles PII differently based on what it touches:

| Phase | What it sees | PII handling |
|---|---|---|
| **Collect** | Metadata only (URIs, timestamps, sizes) | No content fetched. Conversation IDs may embed caller identifiers (Connect contact IDs derive from phone numbers) — kept unredacted for correlation, never sent to models |
| **Merge** | Metadata from collect | Correlates on conversation IDs — these must remain unredacted to match evidence across sources. After merge, the dataset uses internal `test_case_id`; original conversation IDs are dropped from the snapshot |
| **Inventory** | Transcripts fetched on demand for dev browsing | Redacted at fetch time before display. If redaction fails for a transcript, the dev sees metadata only |
| **Snapshot** | Full evidence (transcripts, traces, audio references) | Full redaction pass before assembly into the dataset. Artifacts that fail redaction are excluded with a logged reason |

Redaction is a gate at snapshot time: if an artifact can't be redacted, it doesn't enter the dataset. The build continues with remaining artifacts. A build where all artifacts fail redaction fails entirely.

Execution traces (CloudWatch logs) go through the same redaction pass as transcripts — logs often contain customer data inline (names, account numbers in log messages).

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

### Score matrix

The assertion types above are the defaults. The dev customizes what gets evaluated — and how — through an editable **score matrix**: a configuration file that maps each assertion to its criteria, weight, and pass threshold.

This matters most for voice validation. Different deployments care about different voice quality dimensions — a healthcare bot needs accurate drug name pronunciation, a banking bot needs clear account number readback, a customer service bot might prioritize empathy and tone. Rather than hardcoding a one-size-fits-all voice quality assertion, the score matrix lets the dev break voice quality into the dimensions that matter for their agent and weight them accordingly.

**What the dev edits:**

| Column | What it controls |
|---|---|
| **Assertion** | Which assertion to run (built-in or custom name) |
| **Criteria** | Natural-language description of what "good" looks like — becomes part of the scoring prompt |
| **Weight** | Relative importance in the overall pass/fail verdict |
| **Threshold** | Minimum score (0.0–1.0) for this assertion to pass |
| **Requires** | Evidence types needed (`recording`, `transcript`, `trace`) |
| **Scored by** | Which model evaluates it (`gemini` for audio, `bedrock` for text) |

A team adds a new assertion by adding a row — no code changes to the runner. They can also disable built-in assertions by removing rows or adjust sensitivity by changing thresholds.

The score matrix is versioned with the dataset. The eval run record captures which matrix version was used, so comparisons between runs account for scoring criteria changes.

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

### Resource constraints

The runner uses size metadata from data collection to plan within model limits. Without this, a single long transcript or recording could exceed a model's context window or input limit and fail silently.

| Constraint | Strategy | Why it's architectural |
|---|---|---|
| **Transcript > context window** | Chunk by conversation turns, score each chunk, merge results | Determines how the runner composes scoring prompts — affects assertion design |
| **Trace > context window** | Summarize before sending to model | Lossy — the runner decides what trace detail to drop, which affects flow correctness assertions |
| **Audio > Gemini input limit** | Split into segments, average voice quality scores | Score is an approximation — downstream reporting must account for segment variance |
| **API quotas** | Configurable concurrency per model API (Gemini, Bedrock) | Prevents throttling; default conservative to avoid quota exhaustion on shared accounts |
| **Cost** | Per-run token budget; dry-run mode for cost estimation before scoring | A single eval run can invoke hundreds of model calls — budget prevents runaway spend |

### Cost model

The framework is designed to minimize external API costs by leveraging the dev tool's existing model access.

| Component | Cost approach | Per-run estimate (100 cases, 3 min avg) |
|---|---|---|
| **Bedrock text assertions** | Runs through the host dev tool (Claude Code, Kiro) — covered by existing subscription. No separate API calls. | $0 incremental |
| **Gemini audio scoring** | External API — only cost with no subscription equivalent. ~$0.002/min of audio. | ~$0.60 |
| **PII redaction** | One-time at dataset build. Contact Lens: $0 incremental (already enabled). Comprehend: ~$0.50–2 per build. | N/A (not per-run) |
| **S3/CloudWatch APIs** | Metadata listing at dataset build. | Pennies |
| **Human baseline** | Person-hours, no API cost. | N/A |

**Per prompt iteration cost: under $1** when text assertions use the dev tool's subscription. Gemini audio is the only external spend. This compares to hours-to-days of manual testing per change.

### Storage

All immutable records — datasets, eval runs, human baselines, reports — are stored in a local directory structure within the project. Each record is a versioned JSON file, named by its ID (e.g., `runs/run-2026-11-27-001.json`). No database, no cloud services for MVP.

This keeps the framework dependency-free and version-controllable (the records directory can live in the repo or alongside it). Cloud persistence (S3, DynamoDB) is a future extension for teams that need shared access or long-term retention across machines.

---

## 3. Human Eval Baseline (`/baseline`)

Human reviewers score conversations from the golden dataset. This serves two distinct purposes:

1. **Calibration set** — human scores on calibration-partition cases become the few-shot examples that teach the LLM judge what defects look like. These are scored first, before any automated eval runs.
2. **Comparison baseline** — human scores on a sample of eval-partition cases become the ground truth to compare against automated results. If the automated eval passes a conversation a human would fail, that's a false negative. If it fails one the human would pass, that's a false positive.

The skill manages which cases to present based on what's needed. The reviewer sees the partition label (calibration or eval) so they have context — calibration cases teach the LLM judge, eval cases validate the automated results — but the scoring process is the same either way.

**Sequencing:** Calibration cases are scored first, before any `/run` invocation, since the eval runner needs them as few-shot examples. Eval-partition cases can be scored at any time after.

### How it works

```
/baseline --dataset v3 [--partition calibration|eval]

┌─────────────────────────────────────────────────────────────────────┐
│ PRESENT  (interactive)                                             │
│  Show conversation to reviewer: transcript turn by turn             │
│  Audio: open recording in system default player (already            │
│  PII-redacted in the dataset — no fetch-time processing)            │
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

### Reviewer experience

CLI-driven, same environment as `/build` and `/run`. The reviewer sees PII-redacted transcripts turn by turn and can listen to the recording — the skill opens the audio file in the system's default media player (the recording is already PII-redacted in the dataset, so no additional processing is needed). The reviewer flags defects per turn using a standard taxonomy. AI can assist (e.g., surface turns likely to have pronunciation issues) but the human makes the final judgment — this is the ground truth.

The skill shows the partition label so the reviewer knows the purpose: "calibration — your scores will become few-shot examples for the LLM judge" vs. "eval — your scores will be compared against automated results." The optional `--partition` flag lets the reviewer focus on one set at a time.

### Defect taxonomy

Aligns with the assertion types in the eval runner so human and automated scores are directly comparable.

| Defect type | Scope |
|---|---|
| **Wrong information** | Factually incorrect response |
| **Pronunciation** | Mispronounced word, number, or name |
| **Timing** | Awkward pause, too fast, interruption |
| **Guardrail violation** | Responded outside configured boundaries |
| **Hallucination** | Fabricated information not in knowledge base |
| **Handoff** | Escalation to human was awkward or unnecessary |
| **Persona** | Tone, empathy, or accent doesn't match configured persona |

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

An agent reads eval run records and human baseline records, computes the requested comparison, and generates a self-contained HTML report. The skill opens it in the default browser automatically.

HTML over terminal output because comparison is visual — the dev needs to scan score deltas, spot regressions in a table, and drill into failing test cases. A static HTML file with sortable tables, color-coded pass/fail, and collapsible assertion detail does this without any dashboard infrastructure. No server, no dependencies — just a file the dev can also share with the team.

Reports reference runs and baselines by ID. The HTML is ephemeral — not committed to the repo. The JSON record is the source of truth; `/report` can regenerate the HTML from any stored record at any time.

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

**Rule: no unredacted PII reaches any model, AI tool, or persisted dataset.**

PII redaction is mandatory for dataset generation — the framework will not snapshot content without it. But the redaction provider is pluggable: the dev chooses which provider fits their environment.

### Redaction providers

The framework supports pluggable PII redaction providers. Each provider implements the same contract (accept text, return redacted text with entity annotations). The dev configures which provider to use per deployment.

| Provider | Text | Audio | Best for |
|---|---|---|---|
| **Contact Lens** | Pre-redacted transcript | PII segments replaced with silence | Connect deployments — zero extra work, covers both text and audio automatically post-call |
| **Amazon Comprehend** | On-demand API redaction | No | Fallback for content Contact Lens doesn't cover (CloudWatch traces, non-Connect sources). 100 KB/request limit — oversized transcripts chunked automatically |
| **Presidio** (future) | On-demand, self-hosted | No | Teams needing no cloud dependency, custom entity recognizers, or on-prem requirements |

**Layered approach:** Contact Lens pre-redacted artifacts are used when available (cheapest, covers audio). Comprehend handles everything else. The framework checks for pre-redacted content first, falls back to the configured provider.

### Where PII appears

| Stage | PII handling |
|---|---|
| **Data collection** | Metadata travels freely. Content redacted at fetch time via the configured provider. Per-phase detail in `/build` PII subsection above. |
| **Eval runner** | Receives only redacted content from the dataset. Models never see raw PII. |
| **Human baseline** | Reviewer sees redacted transcripts and hears redacted audio (where available). |
| **Reporting** | Works on scores and verdicts, not raw content. No PII exposure. |

### Entity types

Configurable per deployment. Default set covers names, addresses, phone numbers, account numbers, SSNs, and credit card numbers. Teams narrow or extend based on their compliance requirements. The entity configuration is passed to whichever provider is active.

### Redaction strategy

Placeholder tokens (`[NAME]`, `[PHONE]`, `[SSN]`) rather than synthetic values. Simpler, auditable, and avoids introducing false content into the evaluation dataset. All providers normalize to the same token format regardless of their native output.

**Trade-off:** the LLM judge can't evaluate whether the agent addressed the caller by name correctly. Acceptable — name usage is a persona concern, not a correctness concern, and can be checked via the execution trace instead.

### Audio redaction

Only Contact Lens provides audio redaction today. When no audio redaction is available, audio is blocked and voice quality assertions are skipped. The scorer must distinguish Contact Lens redaction silence from actual timing defects.

### Failure policy

Redaction is a gate, not best-effort. If the configured provider is unavailable or errors on a given artifact, that artifact is excluded — not silently degraded. See `/build` PII subsection for how this plays out per pipeline phase.

---

## End-to-end flow

**Initial setup** (once per dataset version):

| Step | Skill | What happens |
|---|---|---|
| 1 | `/build` | Build golden dataset (collect → merge → inventory → snapshot). Partitions into calibration and eval sets. |
| 2 | `/baseline` | Human scores calibration cases (few-shot examples for LLM judge) + a sample of eval cases (comparison baseline). |

**Inner loop** (every prompt change):

| Step | Skill | What happens |
|---|---|---|
| 3 | `/run` | Automated eval — calibration cases as few-shot context, eval cases scored. Seconds to minutes. |
| 4 | `/report` | Results: did the change help or hurt? |
| 5 | `/report` | Compare two runs: regressions and improvements by scenario. |

**Periodic maintenance:**

| Step | Skill | What happens |
|---|---|---|
| 6 | `/report` | Validate: does the automated eval agree with the human baseline? |
| 7 | `/build` → `/baseline` | Collectors scan same artifact locations, find new production conversations. Dev picks cases to add, scores new calibration + eval sample. |

Steps 3–5 are the fast loop. Steps 6–7 are occasional — when the dev wants to validate the automated eval or bring in fresh production data. No separate promotion pipeline: production artifacts already live where the collectors look.

---

## Open questions

1. ~~**Cross-account access**~~ — Resolved. Authentication is the collector's responsibility, not the framework's. Each collector handles its own login — via MCP browser-based login with user credentials, tokens, or whatever the source requires. This keeps the framework extensible: a new collector for a different account or provider just brings its own auth.
2. ~~**Mixed-source datasets**~~ — Resolved. Multiple collectors feed into a single dataset by design — that's the point of the merge phase. Each collector contributes one evidence type from one source; merge correlates them by conversation ID. One constraint: a dataset uses a single correlation strategy (path-based ID, manifest, etc.) to keep merge deterministic. Mixing correlation strategies within one dataset risks ambiguous matches.
3. ~~**Inter-rater reliability**~~ — Resolved. Single reviewer for now. The baseline is scored infrequently (initial calibration + occasional refresh), so multi-reviewer agreement and conflict resolution aren't worth the investment at this scale. Revisit if the team grows or baseline frequency increases.
4. ~~**Gemini latency and cost**~~ — Resolved. Gemini tokenizes audio at ~32 tokens/second (~1,920 tokens/min). At Flash-tier pricing (~$0.002/min of audio), a 200-recording run with 3-min average conversations costs ~$1.15. Latency is seconds per recording — parallel scoring keeps wall-clock time manageable. Cost is negligible at this scale; 9.5-hour per-prompt limit is well above any single conversation.
5. ~~**Assertion extensibility**~~ — Addressed by the score matrix: devs add rows to the matrix, no code changes needed.

## Future extensions

- **Stratified sampling** — automated dataset refresh for high-volume production
- **Terraform integration** — coverage analysis and spec-driven scenario generation
- **Scenario generator** — automatically derive new test scenarios from existing conversation patterns
- **CI/CD integration** — run eval automatically on prompt changes in a pipeline
- **Trend dashboard** — historical view of eval scores across agent versions (beyond the CLI report)
