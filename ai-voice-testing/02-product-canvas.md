---
artifact: accelerator-product-canvas
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 2 of 5
status: in-progress
updated: 2026-11-20
evidence: { validated: 4, assumed: 5, gaps: 6 }
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
| 1 Problem | 🟢 | 2 Segments | 🟢 | 3 UVP | 🟢 | 4 Solution | 🟡 | 5 Competitive | 🟢 | 6 GTM | 🟡 | 7 Effort | 🟡 | 8 Metrics | 🟡 | 9 Differentiation | 🟢 |

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

## 4 · Solution  🟡 Drafted — architecture decisions pending (G-07, G-08)
| Problem | Capability that solves it |
|---|---|
| Manual test creation is slow and inconsistent | **Scenario generator** — Automatically generate test scenarios from Connect flow definitions (JSON), existing call transcripts, and knowledge base content. Covers happy path, edge cases, and adversarial inputs. |
| Every test requires a human on a phone call | **Eval runner** — Programmatically execute voice conversations against the Connect agent. Simulates realistic caller behavior including pauses, interruptions, and varied intents. [Architecture TBD — G-07: agent-to-agent voice? Polly-driven? Direct API?] |
| Voice quality can only be judged by listening | **Voice quality scorer** — Evaluate pronunciation, timing, cadence, and conversational quality of agent responses using multimodal models on audio recordings. [Approach TBD — G-08, G-13: Bedrock audio capabilities are the riskiest assumption.] |
| Results are scattered across logs and transcripts | **Scorecard and reporting** — Unified dashboard showing pass/fail per scenario, quality scores, regressions from previous runs, and drill-down to specific conversation turns. |
| No baseline for "good enough" | **Human eval UI** — Lightweight custom tool (S3 + CloudFront + DynamoDB) for human evaluators to score recordings on a rubric. Produces baselines and ongoing validation data for scorer consistency. |

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

## 7 · Level of effort  🟡 Drafted — estimates are rough
**MVP build:**
- Scenario generator (Connect flow parser + transcript analyzer): ~3–4 weeks
- Eval runner (voice execution engine): ~4–6 weeks [depends on G-07 architecture decision]
- Voice quality scorer (multimodal audio evaluation): ~3–4 weeks [depends on G-13 spike results]
- Scorecard / reporting: ~2–3 weeks
- Human eval UI (baseline collection): ~2 weeks
- Integration and testing: ~2 weeks
- **Total estimate: ~16–21 weeks**

**Capacity:** ~5 hrs/week per builder (2 builders). At that rate, MVP is roughly 8–10 months unless capacity increases. Solution review week of Dec 7; build starts January.

**Run-cost drivers:**
- Bedrock model invocations for audio evaluation (per-recording cost)
- Amazon Connect usage for programmatic test calls (per-minute telephony)
- S3 storage for recordings and test artifacts
- DynamoDB for eval UI and scorecard data

**Support owner:** Pod (Daniel + Adrian) through MVP. Handoff plan TBD for Slalom-wide adoption.

## 8 · Key metrics  🟡 Drafted — baselines TBD (G-03, G-04, G-11)

**Baseline collection plan:**
- **Before solution review (Dec 7):** Julian interview → G-03 (test volume) and G-04 (cycle time). These anchor the two primary metrics.
- **During build phase:** Human eval UI → G-11 (score consistency). Requires both human scores and framework scores on the same recordings.
- **Post-MVP:** G-14 (production escapes). Requires production call analytics and a feedback loop to attribute defects to testing gaps.

| Metric | Category | Baseline | Target | How measured |
|---|---|---|---|---|
| Test scenarios generated per agent | Adoption | TBD — Julian interview (G-03) | 10× manual volume | Count automated scenarios vs. manual per agent change |
| Time to test a voice agent change | Efficiency | TBD — Julian interview (G-04) | 80% reduction | Wall-clock time: manual test cycle vs. framework run |
| Edge case / adversarial coverage | Quality | Near zero (manual) | 50+ scenarios per agent | Count of adversarial/edge scenarios executed per run |
| Score consistency (human vs. framework) | Accuracy | TBD — human eval UI during build (G-11) | ≥0.85 correlation | Compare framework scores against human evaluator scores on same recordings |
| Agent quality — false negatives | Guardrail | Qualitative — anecdotal from Julian (G-14). Formal baseline deferred to post-MVP. | Maintain or improve | Production escapes tracked via call analytics once framework is in use |
| Human eval throughput | Baseline tool | N/A | 50 recordings scored/hr | Eval UI usage metrics |

## 9 · Differentiation  🟢 Drafted
**What makes this defensible:**
1. **Voice-native evaluation** — Every alternative evaluates text. This framework evaluates what the caller actually hears: pronunciation, timing, cadence, and conversational quality on real audio.
2. **End-to-end orchestration** — Single framework covers scenario generation → voice execution → audio scoring → reporting. No stitching together manual steps or separate tools.
3. **Platform-extensible by design** — Connect is the beachhead, but the architecture separates platform-specific adapters (flow parsing, call execution) from platform-agnostic capabilities (scenario generation, audio scoring, reporting). Extending to other voice platforms (Genesys, Twilio, etc.) means writing a new adapter, not rebuilding the framework.
4. **Human-calibrated scoring** — The custom eval UI produces ongoing human baselines, so the framework's automated scores stay validated against real human judgment — not just model self-assessment.
5. **Slalom delivery moat** — Reusable across engagements. Each Connect project that uses it makes it better (more scenario patterns, more scoring data). Competitors building one-off testing won't accumulate this advantage.

## Coherence check
- [x] Features ↔ problems — Each problem in block 1 maps to a specific capability in block 4
- [x] UVP ↔ early adopters — UVP speaks to dev leads building Connect agents; early adopters are exactly that audience
- [ ] Effort ↔ capacity — 16–21 weeks of work at 5 hrs/week = 8–10 months. Tight. Needs discussion on prioritization or capacity increase.
- [x] Metrics ↔ UVP — "10× volume" and "score consistency" directly validate the UVP claims

## Riskiest assumption
⚠️ **G-13** — Are current Bedrock models good enough at processing and evaluating audio (pronunciation, timing, cadence, tone) to produce scores that match human judgment? If model quality on audio isn't reliable, the framework can't replace human listeners. **This must be spiked before build starts in January.**
