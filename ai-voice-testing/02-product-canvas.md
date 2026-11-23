---
artifact: accelerator-product-canvas
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 2 of 5
status: ready-for-prd
updated: 2026-11-23
evidence: { validated: 7, assumed: 5, gaps: 4 }
profile:
  value_play: customer-efficiency
  audiences: [Customer, Slalom]
  partner: none
  platform: AWS (Amazon Connect)
---

# Product Canvas — AI Voice Testing

> **UVP:** One automated framework to generate, execute, and score voice agent tests at scale — so teams catch pronunciation, timing, and conversational defects before customers hear them.

| Block | Status |
|---|---|
| 1 Problem | 🟢 | 2 Segments | 🟢 | 3 UVP | 🟢 | 4 Solution | 🟢 | 5 Competitive | 🟢 | 6 GTM | 🟡 | 7 Effort | 🟡 | 8 Metrics | 🟡 | 9 Differentiation | 🟢 |

## 1 · Problem  🟢 Drafted
1. **Human bottleneck on voice evaluation** — Every voice response must be heard by a person to evaluate pronunciation, timing, cadence, and conversational quality. This caps test volume at a handful of calls per change.
2. **Chat tests miss voice defects** — Text-based alternatives (Connect's chat tester, transcript review) look fine on screen but miss how responses actually sound. "8880" reads correctly but sounds wrong spoken aloud.
3. **Edge and adversarial cases go untested** — Because each test requires a human on a call, teams can't cover the long tail of scenarios — accent variations, interruptions, ambiguous intents, noisy environments — leaving regressions undiscovered until production.

**How it's solved today:** Manual phone calls one at a time, Connect's built-in chat test tool (text only), post-hoc transcript and log review in the Connect console, CloudWatch logs pasted into LLMs via Miro for diagnosis, and early adoption of DeepEval (not voice-native). Julian confirmed: "it's a lot of manual testing."

## 2 · Customer segments  🟢 Drafted
**Users:** Dev leads and engineers who build voice and chat agents in Amazon Connect — they configure instructions, actions, knowledge bases, guardrails, and handoff rules. (Persona: "Rosa, dev lead")
**Buyers / sponsors:** Engineering managers and contact center leaders at enterprises deploying AI voice agents — they own release quality and velocity.
**Beneficiaries:**
- **Customer** — Enterprise teams who need confidence their voice agents work correctly before going live
- **Slalom** — Delivery teams building Connect solutions; high demand, low capacity in voice AI (Jamie)
- **AWS** — Amazon Connect team and field; Julian's team confirmed the pain is real

**Early adopters:** [TBD — G-10] Candidates: Julian's Connect practice team at Slalom, an active Slalom Connect delivery engagement, or a customer team that just shipped a voice agent and felt the testing pain. Jamie/Jake to identify.

## 3 · Unique value proposition  🟢 Drafted
**One line:** Automated voice agent testing that hears what chat tests can't — catch pronunciation, timing, and conversational defects at 10× the volume before customers do.

**Value by audience:**
- **Customer:** Ship voice agents with confidence. Cover adversarial and edge cases that manual testing misses. Catch regressions before they reach callers.
- **Slalom:** Faster delivery (automated testing shortens the test cycle on Connect engagements, so Slalom can take more projects in a high-demand area) + differentiated offering ("we have automated voice testing, competitors don't" is a win-rate lever for Connect pursuits).
- **AWS:** Strengthens the Connect ecosystem. Addresses a confirmed pain point in the platform's adoption path.

## 4 · Solution  🟢 Drafted — all architecture decisions resolved
| Problem | Capability that solves it |
|---|---|
| Manual test creation is slow and inconsistent | **Scenario generator** — Automatically generate test scenarios from Connect flow definitions (JSON), existing call transcripts, and knowledge base content. Covers happy path, edge cases, and adversarial inputs. |
| Every test requires a human on a phone call | **Eval runner** — Direct API calls with the hybrid model split (G-07). For existing recordings: passes audio to Gemini (voice quality) and transcripts/traces to Bedrock (text assertions). For generated scenarios without recordings: executes against Connect/Lex/Bedrock APIs to produce transcripts and traces, then scores via Bedrock. No telephony — no phone calls, no Polly, no agent-to-agent voice. |
| Voice quality can only be judged by listening | **Voice quality scorer** — Evaluate pronunciation, timing, cadence, and conversational quality of agent responses. **Hybrid architecture (G-15):** Calls Google Gemini API directly, passing audio for voice quality evaluation. Bedrock handles all text-based assertions. Direct API integration — no SDK wrapper or middleware needed. |
| Results are scattered across logs and transcripts | **Scorecard and reporting** — Unified dashboard showing pass/fail per scenario, quality scores, regressions from previous runs, and drill-down to specific conversation turns. |
| No baseline for "good enough" | **Human eval UI** — Lightweight custom tool (S3 + CloudFront + DynamoDB) for human evaluators to review conversations. Displays the transcription turn by turn; reviewers flag defects on individual turns (wrong info, pronunciation issue, awkward handoff, guardrail violation, hallucination, etc.). Produces per-conversation defect rates, baselines for quality tracking across agent versions, and few-shot calibration data for the LLM judge. |

## 5 · Competitive landscape  🟢 Drafted
| Alternative | Type | Gap for our segment | Source |
|---|---|---|---|
| Manual phone testing | Status quo | Doesn't scale — caps at a handful of tests per change. No structured coverage. | Julian interview |
| Connect chat test tool | Built-in | Text only. Misses pronunciation, timing, cadence, tone — all voice-specific defects. | Julian interview |
| Connect contact search + transcripts | Built-in | Post-hoc and reactive. Finds problems after customers experience them, not before. | Julian interview |
| DeepEval | OSS framework | Customers starting to use it, but it's not voice-native. Evaluates text, not audio quality. | Julian interview |
| AgentCore agentic evals accelerator | Slalom internal | Does not support voice. Text/chat agent evaluation only. Inspiration but not extensible to audio. | Pod research |
| CloudWatch + LLM via Miro | Manual workaround | Ad-hoc, no repeatability, no scoring rubric, no regression tracking. | Julian interview |
| AWS Agentic CX Designer | AWS (new) | Limited, very platform-tied, doesn't integrate well with customers' mixed solutions. No testing focus. | Jake |

**Positioning:** The framework is an **orchestration layer**, not a competitor to these tools. DeepEval, AgentCore, and Connect analytics are pluggable components it can consume. The unique value is end-to-end voice testing — from scenario generation through voice execution to audio quality scoring — which no single tool covers today.

## 6 · GTM strategy  🟡 Drafted — needs validation
**Route to market:** Slalom delivery engagements → embedded in Connect projects as a testing accelerator. Not a standalone product sale.
- **Phase 1 (internal):** Pod builds MVP. Validate with Julian's team or an active Connect engagement.
- **Phase 2 (Slalom-wide):** Package as a reusable accelerator for all Slalom Connect delivery teams. Shortens project timelines → more projects per quarter.
- **Phase 3 (customer-facing):** Offer as a differentiated capability in Connect proposals. "Automated voice agent testing included" as a win-rate lever.

**Value levers:**
- Delivery efficiency — Reduce testing time per agent change by an order of magnitude
- Win rate — Differentiated testing capability competitors don't offer
- Reusability — Same framework across engagements, amortizing build cost

**Pricing model:** No direct pricing for MVP. Value captured through faster delivery (more projects) and higher win rate on Connect pursuits. Future: potential AWS Marketplace listing or customer licensing if demand warrants.

## 7 · Level of effort  🟡 Drafted — estimates adjusted for AI-assisted development
**MVP build (with AI coding tools — Claude Code, Copilot, etc.):**
- Scenario generator (Connect flow parser + transcript analyzer): ~1.5–2 weeks
- Eval runner (direct API, hybrid model split): ~2–3 weeks
- Voice quality scorer (Gemini API integration for audio + Bedrock for text): ~2–3 weeks
- Scorecard / reporting: ~1–1.5 weeks
- Human eval UI (baseline collection + per-turn defect flagging): ~1–1.5 weeks
- Integration and testing: ~1–2 weeks
- **Total estimate: ~9–13 weeks**

**Why the reduction:** AI coding tools accelerate scaffolding, boilerplate, AWS SDK integration, and UI buildout — the well-defined parts. The estimates stay conservative on the pieces that require design decisions and spike results (eval runner architecture, voice scorer model integration), where the bottleneck is thinking, not typing.

**Capacity:** ~5 hrs/week per builder (2 builders). At that rate, MVP is roughly **5–7 months**. Solution review week of Dec 7; build starts January.

**Run-cost drivers:**
- Google Gemini API calls for audio evaluation (per-recording, voice quality assertions)
- Bedrock model invocations for text-based assertions (per-recording)
- S3 storage for recordings and test artifacts
- DynamoDB for eval UI and scorecard data

**Support owner:** Pod (Daniel + Adrian) through MVP. Handoff plan TBD for Slalom-wide adoption.

## 8 · Key metrics  🟡 Drafted — baselines TBD (G-03, G-04, G-11)

**Baseline collection plan:**
- **Before solution review (Dec 7):** Julian interview → G-03 (test volume) and G-04 (cycle time). These anchor the two primary metrics.
- **During build phase:** Technical spike → G-11 (score consistency). Run the same recordings through the scorer multiple times with identical config; measure run-to-run variance in scores and verdicts.
- **Post-MVP:** G-14 (production escapes). Requires production call analytics and a feedback loop to attribute defects to testing gaps.

| Metric | Category | Baseline | Target | How measured |
|---|---|---|---|---|
| Test scenarios generated per agent | Adoption | TBD — Julian interview (G-03) | 10× manual volume | Count automated scenarios vs. manual per agent change |
| Time to test a voice agent change | Efficiency | TBD — Julian interview (G-04) | 80% reduction | Wall-clock time: manual test cycle vs. framework run |
| Edge case / adversarial coverage | Quality | Near zero (manual) | 50+ scenarios per agent | Count of adversarial/edge scenarios executed per run |
| Score consistency (run-to-run) | Reliability | TBD — technical spike during build (G-11) | ≥0.90 agreement across repeated runs | Pass the same recording to the same scoring agent N times with identical prompt/model/config; measure score and verdict variance across runs |
| Agent quality — false negatives | Guardrail | Qualitative — anecdotal from Julian (G-14). Formal baseline deferred to post-MVP. | ≤5% false negative rate | **Post-MVP sampling loop:** Framework scores a test run → human evaluators review a random sample of the same recordings via the eval UI → any recording the framework passed but the human failed is a false negative. Rate = (framework-pass ∩ human-fail) / total human-fail. Related to G-11 (G-11 measures run-to-run reproducibility; this measures whether the scorer catches real defects). |
| Conversation defect rate | Quality | TBD — human eval UI during build | Trend downward across agent iterations | Human reviewers read the transcription in the eval UI and flag defects per turn (e.g., wrong info, pronunciation issue, awkward handoff, guardrail violation, hallucination). Defect rate = flagged turns / total turns in the conversation. Tracked per agent version to show whether changes improve or regress quality. |
| Human eval throughput | Baseline tool | N/A | 50 recordings scored/hr | Eval UI usage metrics |

## 9 · Differentiation  🟢 Drafted
**What makes this defensible:**
1. **Voice-native evaluation** — Every alternative evaluates text. This framework evaluates what the caller actually hears: pronunciation, timing, cadence, and conversational quality on real audio.
2. **End-to-end orchestration** — Single framework covers scenario generation → voice execution → audio scoring → reporting. No stitching together manual steps or separate tools.
3. **Platform-extensible by design** — Connect is the beachhead, but the architecture separates platform-specific adapters (flow parsing, call execution) from platform-agnostic capabilities (scenario generation, audio scoring, reporting). Extending to other voice platforms (Genesys, Twilio, etc.) means writing a new adapter, not rebuilding the framework.
4. **Human-calibrated scoring** — The custom eval UI produces ongoing human baselines, so the framework's automated scores stay validated against real human judgment — not just model self-assessment.
5. **Slalom delivery moat** — Reusable across engagements. Each Connect project that uses the framework sharpens Slalom's expertise with it — better scenario patterns, refined rubrics, lessons on what assertions catch real defects — but customer data is never shared or pooled. Each engagement's data stays with that customer. The advantage accumulates in the framework's design and the team's know-how, not in a central data repository.

## Coherence check
- [x] Features ↔ problems — Each problem in block 1 maps to a specific capability in block 4
- [x] UVP ↔ early adopters — UVP speaks to dev leads building Connect agents; early adopters are exactly that audience
- [ ] Effort ↔ capacity — 9–13 weeks of work at 5 hrs/week = 5–7 months. More realistic with AI coding tools, but still tight on part-time capacity. Prioritization of capabilities may still be needed.
- [x] Metrics ↔ UVP — "10× volume" and "score consistency" directly validate the UVP claims

## Riskiest assumption
⚠️ **Can Google Gemini reliably evaluate voice quality from audio?** The hybrid architecture decision (G-15) commits to Gemini for `voice_quality` assertions. But we haven't validated that Gemini's audio interpretation produces scores on pronunciation, cadence, tone, and timing that are consistent run-to-run (G-11) and meaningful enough to replace human listeners. If Gemini's audio evaluation isn't reliable, the voice-native UVP collapses back to text-only — the same gap every competitor has. **Must spike before build starts in January.**

*Previous riskiest (resolved):* G-13 / G-15 — whether Bedrock could handle audio evaluation. Answer: no. Decision: hybrid architecture with Gemini for audio, Bedrock for text.
