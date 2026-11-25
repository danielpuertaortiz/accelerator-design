---
artifact: accelerator-problem-statement
accelerator: AI Voice Testing
pod: Daniel Puerta, Adrian Gutierrez Rodriguez
step: 1 of 5
status: ready-for-canvas
profile:
  value_play: customer-efficiency
  audiences: [Customer, Slalom]
  partner: none (AWS is the platform, not a co-sell partner for MVP)
  platform: AWS (Amazon Connect)
updated: 2026-11-18
---

# Problem Statement: AI Voice Testing

## The statement
> **Dev leads building voice agents in Amazon Connect** struggle to **test and validate agent behavior at scale** because **every voice response must be heard by a human to evaluate pronunciation, timing, and conversational quality — capping test volume and leaving adversarial and edge cases uncovered.** This matters now because **enterprises are rapidly shifting from scripted IVR to agentic voice, and Slalom sees high demand with limited delivery capacity.** We'll know it's solved when **the framework produces voice quality scores consistent with human evaluators while increasing test volume by an order of magnitude** — Julian's team currently runs up to 100 manual calls per change, taking hours (simple) to days (complex). Baseline consistency threshold to be established via a custom eval UI that collects human scores on voice recordings. [Remaining TBD — G-11]

## 01 · User segment  🟡 Drafted with gaps
**Primary user:** Dev leads and engineers who build voice and chat agents in Amazon Connect — they configure instructions, actions, knowledge bases, guardrails and handoff rules to human agents. Amazon Connect is the beachhead; the framework should be extensible to other agentic voice platforms in the future. (From Solution 3 notes: persona "Rosa, dev lead")
**Beneficiaries:**
- **Customer:** Enterprise teams deploying AI voice agents in contact centers who need confidence their agents work correctly before going live
- **Slalom:** Delivery teams building Amazon Connect voice solutions for clients (Jamie notes high demand, low capacity in voice AI at Slalom — e.g., Ring conversation)
- **AWS:** Amazon Connect team and field — Julian's team confirmed the testing pain is real
**Early adopters:** [TBD — see G-10]

## 02 · Pain points  ✅ Drafted
**Today's workflow & where it breaks:** Testing voice agents in Amazon Connect is entirely manual. Builders make hand-dialed calls, or run chat-based tests hoping they behave the same as voice. Julian confirmed: "when we are building Connect agents, voice experience, it's a lot of manual testing." They listen to recordings, check transcripts, analyze CloudWatch logs, and even paste logs into LLMs via Miro to diagnose why an agent didn't call the knowledge base. (From transcript, ~20:03)

The two pains are linked: **a human must hear every voice response to evaluate it**, and that bottleneck caps test volume. Chat tests miss voice-specific defects — pronunciation ("8880" looks fine in text but sounds wrong spoken aloud), response timing, cadence, and tone — so they can't substitute for listening. Because every evaluation requires a person on a call, teams can only run a handful of tests per change, leaving adversarial and edge cases uncovered. The framework must increase test volume **without losing confidence on voice quality**.

**Current alternatives:**
- Manual phone calls to the agent, one at a time
- Connect's built-in chat test tool (text only — misses voice-specific issues like pronunciation, timing, cadence)
- Contact search & transcripts in Connect console (post-hoc, not preventive)
- CloudWatch logs + manual LLM analysis via Miro
- DeepEval — Julian mentioned customers are starting to use it, but it's not voice-native
**Severity / frequency:** Every agent change requires re-testing — Julian's team makes up to 100 human-placed calls per change to cover different scenarios. Simple changes take several hours end-to-end; moderate/complex changes take days. Voice always requires manual testing for persona tuning (accent, tone, speed, empathy) and catching pronunciation issues (e.g., acronyms, numbers read as "3,4,4,5" instead of "3,445"). Tools like Kiro speed up the logs/fix cycle, but calling is still manual. (G-03, G-04 — SME interview, Julian Garrido Rodriguez, 2026-11-25)
**Evidence:** Julian Garrido Rodriguez (Slalom Amazon Connect practice, builds Connect solutions for banks and enterprises) confirmed the pain directly in the Nov 13 session and again in a Nov 25 follow-up: up to 100 manual test calls per change, hours-to-days cycle, voice issues (pronunciation, empathy, persona) only caught on real calls. Jamie sees "lots of demand and little capacity at Slalom in voice AI." Jake notes AWS-launched features tend to be limited and don't integrate well with customers' mixed solutions. (From transcript + Solution 3 notes + SME interview 2026-11-25)

## 03 · Business context  ✅ Drafted
**Why now:** Enterprises are rapidly adopting agentic voice experiences in contact centers (Julian: "a lot of companies are transforming and moving to this type of experiences"). Amazon Connect recently launched Agentic CX Designer (acquired NLX). The shift from scripted IVR to agentic voice means testing complexity has exploded — agents handle open-ended conversations, not fixed decision trees. Slalom just finished a bank implementation and sees growing pipeline. (From transcript)
**Value by audience:**
- **Customer:** Faster, more reliable voice agent releases; catch regressions before customers hear them; cover adversarial/edge cases that manual testing misses
- **Slalom:** Two levers. First, **faster delivery** — automated voice testing shortens the test cycle on Connect engagements, so each project finishes sooner and Slalom can take more of them in a high-demand, low-capacity area (Jamie). Second, **differentiated offering** — "we have automated voice testing, competitors don't" is a win-rate lever for Connect pursuits. Reusable across engagements.

## 04 · Success criteria  🟡 Drafted with gaps
| Metric | Type | Baseline | Target | By when | How we'll measure |
|---|---|---|---|---|---|
| Test scenarios generated per agent | Primary | ~100 manual calls/change (G-03) | 10× coverage (1,000+ automated scenarios) | [TBD] | Count automated scenarios vs. manual |
| Time to test a voice agent change | Primary | Hours (simple) to days (complex) (G-04) | Minutes per change | [TBD] | Measure manual vs. framework time |
| Edge case / adversarial coverage | Primary | [TBD — see G-05] | [TBD] | [TBD] | [TBD] |
| Score consistency (human vs. framework) | Primary | [TBD — see G-11] | [TBD] | [TBD] | Compare framework scores against human evaluator scores for the same conversations |
| Agent quality (false negatives) | Guardrail | [TBD] | Maintain | Ongoing | [TBD] |

**How we'll produce baselines:** Build a lightweight custom eval UI (S3 + CloudFront + DynamoDB) that plays Connect recordings and collects human scores on a custom rubric (pronunciation, timing, cadence, conversational quality). No off-the-shelf AWS service fits — Ground Truth/A2I are closed to new customers, Bedrock Human Eval is text-only, MTurk is shut down. The custom UI also becomes the ongoing validation tool for score consistency (G-11). Those baselines become the benchmark the framework must match or exceed. (G-12 answered)

## 05 · Constraints  ✅ Drafted
- Program: AWS (Amazon Connect) · ~5 hrs/week per builder · solution review wk of Dec 7 · build starts January
- Must work with Amazon Connect's existing architecture: flows (JSON), SDK, CloudFormation/Terraform, transcripts, recordings in S3, CloudWatch logs (From Camilo's comment)
- **New build, not an extension.** The AgentCore agentic evals accelerator exists but does not support voice. This accelerator is inspired by that framework but is an independent build — no hard dependency on AgentCore's architecture or codebase. (From Solution 3 notes + pod decision)
- Designed for Connect first, but extensible to other agentic voice platforms (pod decision, PS-01)
- Stretch goal: leverage new Agentic CX Designer functionality in Connect (Jamie's suggestion)
- Access: pod has requested access to Innovation Labs Connect Demo via ServiceNow; Julian will share the hotel workshop (CloudFormation template)
- Jake's caution: AWS-launched features tend to be limited, very platform-tied, and don't integrate well with customers' mixed solutions — the framework should account for this

## 06 · Open questions  ✅ Drafted
- [x] ~~Bedrock audio evaluation (G-13)~~ — Answered: Nova Sonic 2.5 transcribes first, can't evaluate voice natively. Resolved by hybrid architecture (G-15): Gemini for audio, Bedrock for text.
- [x] ~~Competitive positioning (G-01)~~ — Answered: the framework is an orchestration layer, not a competitor. Tools like DeepEval, AgentCore, and Connect analytics are pluggable components it consumes. The moat is extensibility across voice platforms.
- [x] ~~AWS co-sell / funding alignment (G-02)~~ — Answered: no co-sell assumed for MVP; scoped as customer efficiency
- [x] ~~Manual testing volume/time baselines (G-03, G-04)~~ — Answered: up to 100 manual calls per change; hours (simple) to days (complex). SME interview, Julian, 2026-11-25.
- [x] ~~Eval runner approach (G-07)~~ — Answered: direct API calls, no telephony. Gemini for audio, Bedrock for text.
- [x] ~~Voice-specific quality evaluation (G-08)~~ — Answered: resolved by G-13/G-15 hybrid architecture.
- [x] ~~Audio chunk access (G-06)~~ — Answered: framework will use complete call recordings from S3
- [ ] Score consistency threshold (G-11) — What run-to-run reproducibility is acceptable?
- [ ] Early adopters (G-10) — Who tries this first?
- Parked: G-05 (edge case coverage) — depends on each business's dataset, not the framework's scope
- Parked: G-09 (Agentic CX Designer) — out of scope for MVP

## Solution ideas (parked for canvas)
- Generate test scenarios from Connect flows (JSON) and existing transcripts (Camilo's idea)
- Eval runner with agent-to-agent voice conversations
- Scorecard of results
- Leverage AgentCore evals accelerator, extend to voice
- Stretch: integrate with Agentic CX Designer
