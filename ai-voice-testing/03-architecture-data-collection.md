---
artifact: accelerator-architecture-data-collection
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 3 of 5
status: draft
updated: 2026-11-25
depends-on: [02-product-canvas]
feeds: [scenario-generator, eval-runner, voice-quality-scorer, scorecard, human-eval-ui]
---

# Architecture: Data Collection Block

## Context

Every downstream capability — scenario generation, eval runner, voice scoring, reporting, human eval UI — needs data before it can work. The data collection block is the first piece of architecture because everything else depends on it.

**Key design insight:** The golden dataset and the eval run are on different cadences. The dataset is built once and refreshed periodically. The eval run happens on every prompt change — fast, deterministic, against the fixed dataset.

## Starting from artifacts

The framework does not assume a metadata API or a specific platform. In the simplest case, all the team has is recordings in S3, transcripts in S3, and logs in CloudWatch. The framework collects metadata from these artifact locations, merges everything into a structured inventory, and lets the dev curate from there with AI assistance.

## Evidence types

Three types of evidence, each optional — at least one must be present per conversation.

| Evidence type | What it answers |
|---|---|
| **Recording** | How did the agent *sound*? |
| **Transcript** | What did the agent *say*? |
| **Execution trace** | *How* did the agent process the request internally? |

Missing evidence degrades gracefully — null fields, not errors. Downstream capabilities adapt based on what's present.

## Collectors

Each evidence type has its own **collector** — an independent module that knows how to pull metadata for one type of artifact from one kind of source.

**Collector contract:** A collector must:
1. Return a standard structured response per artifact (see below)
2. Declare which evidence type it contributes (`"recording"`, `"transcript"`, `"trace"`)
3. Support a date-range filter to scope the batch

Adding a new source (a different S3 layout, a Genesys API, a local directory) means writing a new collector. The merge step doesn't change.

### Collector response

Every collector returns the same structure, regardless of source:

```
COLLECTOR ITEM
├── conversation_id       (extracted via configured ID extraction — e.g., from S3 key or log field)
├── evidence_type         ("recording" | "transcript" | "trace")
├── reference
│   ├── uri               (S3 key, CloudWatch log stream — pointer, not content)
│   └── location_type     ("s3" | "cloudwatch" | "local")
├── metadata
│   ├── timestamp
│   ├── size_bytes
│   └── extra {}          (collector-specific — e.g., event count for traces)
└── collector             (which collector produced this — for provenance)
```

**Conversation ID extraction:** The correlation key comes from the artifact naming convention. Connect embeds a contact ID in S3 paths and CloudWatch log fields. Other setups may use filename prefixes, manifest files, or timestamp proximity. Each collector is configured with its extraction method.

## Pipeline

The dev runs a single command. An orchestrator coordinates the workflow — collect, merge, and snapshot are automatic; the dev only interacts during inventory selection.

```
voice-eval build --config ./collectors.yaml

┌─────────────────────────────────────────────────────────────────────┐
│ COLLECT  (automatic)                                               │
│                                                                     │
│  Collector agents run in parallel, one per source                   │
│  ──→ Structured items (references + metadata, not content)          │
├─────────────────────────────────────────────────────────────────────┤
│ MERGE  (automatic)                                                 │
│                                                                     │
│  Correlate items by conversation ID                                 │
│  ──→ Conversation inventory                                         │
├─────────────────────────────────────────────────────────────────────┤
│ INVENTORY  (interactive)                                           │
│                                                                     │
│  Dev browses, searches, selects conversations for golden dataset    │
│  AI available as tool: classify, search transcripts, surface        │
│  patterns — the dev drives, AI assists                              │
│  ──→ Selection with tags (category, scenario label, notes)          │
├─────────────────────────────────────────────────────────────────────┤
│ SNAPSHOT  (automatic)                                              │
│                                                                     │
│  Fetch full evidence, PII redaction, assemble, partition            │
│  ──→ Immutable dataset version                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Under the hood — agent workflow:**

| Agent | Role | Tools |
|---|---|---|
| **Collector agents** (parallel, one per source) | Scan artifact locations, return structured items | S3 ListObjects, CloudWatch DescribeLogStreams, Connect SearchContacts |
| **Inventory agent** (interactive) | Present inventory to dev, fetch and PII-redact transcripts on demand when asked, assist with search and classification | S3 GetObject, Comprehend (PII) |
| **Snapshot agent** | Fetch full evidence, assemble test cases, partition | S3 GetObject, CloudWatch GetLogEvents, Comprehend (PII) |

The orchestrator runs collect → merge, then drops into the interactive inventory session. When the dev confirms their selection, snapshot runs automatically.

### Collect

Collector agents run in parallel. Each scans its location and returns structured items — artifact references and lightweight metadata, not content. A date-range filter scopes to relevant conversations.

Lightweight operation — paginated listing calls. For a few hundred conversations it completes in seconds. Standard retry per request (3 retries, exponential backoff). A failed collector for one conversation produces a partial entry, not an error.

### Merge

Groups collector items by conversation ID into a **structured conversation inventory**. Each entry has a correlation ID, references to available artifacts (pointers, not content), derived metadata (size, timestamps), and which evidence types are present.

The inventory is metadata only — no PII risk.

**Correlation strategies** (configured per deployment):

| Strategy | When to use |
|---|---|
| **Path-based ID** | Platforms that embed IDs in artifact paths (Connect, etc.) |
| **Manifest file** | Exported datasets, manually curated collections |
| **Timestamp proximity** | No shared ID, but artifacts created in sequence |
| **Filename prefix** | Manual recordings, test labs |

### Inventory (interactive)

The only step the dev interacts with. The dev browses the conversation inventory and selects which cases go into the golden dataset. For each selected conversation they tag: category (happy-path, edge-case, adversarial), scenario label, and optional notes.

**AI is a tool, not the driver.** The dev can ask the AI to search transcripts ("which conversations have number pronunciation issues?"), classify conversations in bulk, or surface scenarios they haven't thought of. Each transcript the AI reads is PII-redacted at fetch time. But the dev makes the selection — the AI doesn't propose a dataset for approval.

**On refresh:** The dev runs `voice-eval build` again. Collect and merge show the delta — new conversations since the last build. The dev selects from the new ones and the dataset gets a new version.

### Snapshot

Runs automatically after the dev confirms the curated selection:

1. **Fetch full evidence** — recording URIs, full transcripts, complete traces. PII redaction on all content.
2. **Assemble** — package into the unified test case schema with the confirmed tags.
3. **Partition** — split into judge-calibration vs. eval sets (no overlap).
4. **Freeze** — produce an immutable dataset version.

### Refreshing the golden dataset

Two mechanisms, both producing a new immutable version:

- **Promotion from production** — valuable new scenarios identified via scorecard or human eval UI get tagged and added.
- **Re-build** — new conversations accumulate, the dev runs `voice-eval build` again. Collect and merge show the delta, dev selects from new conversations.

## PII handling

**Rule: no unredacted PII reaches any model or AI tool.**

Collect pulls only metadata and references — no content. Unredacted data stays in the original source under the customer's access controls.

PII redaction happens at **fetch time** — when the inventory agent reads a transcript on demand or when the snapshot agent assembles the dataset. The redaction tier depends on what tooling is available:

| Tier | Transcript | Audio |
|---|---|---|
| **Full audio + text** (e.g., Contact Lens) | Use pre-redacted transcript | Redacted audio available for voice scoring |
| **Text only** (e.g., Comprehend) | Redact via Comprehend at fetch time | Audio blocked — skip voice quality scoring |
| **None** | Transcript blocked from AI and models until PII pipeline configured | Audio blocked |

**Audio stays in place.** The framework stores URI references only — never copies recordings out of their source location.

**MVP (Connect):** Contact Lens is a prerequisite for voice quality scoring. Without it, the framework runs text-based assertions only.

**PII adds to the cost model.** Comprehend DetectPiiEntities has per-region TPS limits and per-character pricing. PII calls are bounded by the number of transcripts actually fetched (review selection + snapshot), not total inventory size. Comprehend's 100 KB input limit means oversized transcripts are chunked before detection, results merged.

## Size tracking for downstream token budgets

Collectors capture size metadata per artifact so downstream capabilities can plan without re-reading content:

| Tracked | Source | Why it matters downstream |
|---|---|---|
| Transcript word count | S3 object size or Content Lens metadata | Eval runner batches within model context windows |
| Audio duration (seconds) | S3 object metadata / file header | Voice scorer estimates Gemini input cost; long recordings may need chunking |
| Trace event count | CloudWatch log entry count | Eval runner decides whether to summarize or pass full trace |

## Unified test case schema

Same schema regardless of origin (curated or generated). Fields are nullable.

```
TEST CASE
├── test_case_id
├── origin                (curated | generated)
├── available_sources[]   ("recording", "transcript", "trace")
├── scenario
│   ├── description
│   ├── category          (happy-path, edge-case, adversarial)
│   ├── scenario_label    ("number reading", "escalation", etc.)
│   ├── notes             (nullable)
│   └── caller_turns[]    (nullable — generated scenarios only)
├── evidence
│   ├── conversation_id   (nullable — correlation key)
│   ├── recording_uri     (nullable)
│   ├── transcript        (nullable — PII-redacted)
│   └── execution_trace   (nullable)
├── size_metadata         (word count, duration, event count)
├── pii_redaction_tier
└── provenance
```

## Partitioning: judge-calibration vs. eval

The LLM judge needs calibration examples with human scores. If those same cases appear in the eval set, the judge's scores aren't independent.

Two non-overlapping sets:
- **Judge-calibration** — few-shot examples with human scores (from the eval UI)
- **Eval** — scored by the LLM judge; measured for run-to-run consistency (G-11)

Split and random seed recorded for reproducibility.

## Output

Each snapshot produces an **immutable dataset version** containing:

- **Manifest** — provenance, collectors used, curation metadata, stats, PII summary
- **Test cases** — unified schema with PII-redacted evidence and tags
- **Partition map** — judge-calibration vs. eval assignment

## How this feeds downstream

| Capability | What it consumes |
|---|---|
| **Scenario generator** | Conversation patterns + scenario labels → derive new scenarios |
| **Eval runner** | Test cases with evidence and `available_sources[]` |
| **Voice quality scorer** | Recording URIs + transcripts |
| **Scorecard / reporting** | Manifest (provenance, curation metadata, PII summary) |
| **Human eval UI** | Recordings + transcripts for human defect flagging; also serves as review interface |

## Design principles

| Principle | How it's applied |
|---|---|
| **Artifacts are the entry point** | Starts from S3 paths and log groups, not a metadata API |
| **Single command, agent workflow** | `voice-eval build` orchestrates collectors, merge, interactive selection, and snapshot — the dev only interacts during inventory |
| **Dev drives, AI assists** | The dev selects cases for the golden dataset. AI is a tool for search, classification, and pattern discovery — not the decision-maker |
| **Platform-agnostic** | Collectors and correlation strategies are pluggable; Connect is the first configuration |
| **Evidence-first** | Built on runtime evidence — real conversations, not configured intent |
| **PII at fetch time** | Collection is metadata only; PII redaction happens when content is actually read |
| **Graceful degradation** | Missing evidence → null fields, not errors |
| **Dataset versioning** | Immutable snapshots; new snapshot = new version |
| **Train/eval separation** | Judge-calibration and eval sets never overlap |

## Future extensions

- **Stratified sampling** — automated dataset refresh for high-volume production or cross-engagement benchmarking
- **Terraform integration** — Connect-specific coverage analysis and spec-driven scenario generation

## Open questions

1. **Cross-account access** — IAM implications when Connect, S3, and CloudWatch live in different accounts.
2. **Curation UX** — Does the human eval UI double as the review interface, or is curation CLI/AI-only?
3. **Mixed-source datasets** — Can a single golden dataset mix conversations from different collectors or correlation strategies?
