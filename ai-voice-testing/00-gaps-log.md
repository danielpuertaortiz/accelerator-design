---
artifact: accelerator-gaps-log
accelerator: AI Voice Testing
updated: 2026-11-18
---

# Knowledge Gaps Log: AI Voice Testing

**Open:** 7 (⚠️ 1 before solution review) · **In research:** 0 · **Answered:** 4 · **Parked:** 2

## Open & in research
| ID | Gap (question or assumption) | Type | Priority | Raised in | Who can answer | How we'll find out | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| G-01 | ~~Competitive positioning vs. existing tools~~ Answered — see below | Unknown | Before solution review | PS-01, PS-06 | AWS AI/ML SA, AgentCore team, market research | Desk research + SME interview | Daniel | Answered |
| G-02 | ~~Is there AWS co-sell, funding or program alignment?~~ Answered — see below | Unknown | Before solution review | PS-03 | Jamie, Jake, AWS partner team | SME interview | Jamie | Answered |
| G-03 | What does manual voice agent testing volume look like today — how many test calls per agent change? **Ask Julian:** "Roughly how many test calls does your team make per change? For example, if you update the prompt or add a new tool, how many calls do you make before you're confident it works?" | Unknown | Before solution review | PS-04 | Julian Garrido Rodriguez, Connect delivery teams | SME interview | Julian | Open |
| G-04 | How long does it take to manually test a voice agent change end-to-end (call + log analysis + fix cycle)? **Ask Julian:** "End to end, from making a change to being confident it's working correctly, how long does that cycle take? Including calls, listening to recordings, checking transcripts, digging through CloudWatch logs, and any back-and-forth fixes. 30 minutes? A few hours? A full day?" | Unknown | Before solution review | PS-04 | Julian Garrido Rodriguez | SME interview | Julian | Open |
| G-07 | What does the eval runner look like — agent-to-agent voice conversations? How do we simulate realistic voice input programmatically? Part of the architecture definition. | Decision | Before build | PS-06 | Pod + Julian | Technical spike / prototype | Adrian | Open |
| G-08 | How do we evaluate voice-specific quality (pronunciation, timing, cadence, tone) beyond text correctness? | Unknown | Before build | PS-06 | AWS Polly/Connect teams, voice UX experts | Desk research + technical spike | Adrian | Open |
| G-10 | Who are the early adopters — Julian's team, a specific Slalom engagement, or a customer team? Who feels the pain badly enough to try something new? | Unknown | Before build | PS-01 | Jamie, Jake, Julian | SME interview | Jamie | Open |
| G-11 | What level of score consistency between human evaluators and the framework is acceptable? What's the tolerance? | Decision | Before build | PS-04 | Pod + Julian | Technical spike | Julian | Open |
| G-12 | ~~Is Bedrock's human workforce service the right tool for gathering manual baselines?~~ Answered — see below | Unknown | Before build | PS-04 | AWS SA, pod | Desk research | Daniel | Answered |
| G-13 | ⚠️ Are current Bedrock models good enough at processing and evaluating audio (pronunciation, timing, cadence, tone) to produce scores that match human judgment? This is the riskiest assumption — if model quality on audio isn't reliable, the framework can't replace human listeners. | Assumption | Before solution review | PS-06 | AWS Bedrock team, pod | Technical spike / prototype | Adrian | Open |
| G-14 | What is the current rate of production escapes — voice agent defects that slip through manual testing and reach callers? **Ask Julian:** "Can you think of times a defect made it to production that testing should have caught?" Likely anecdotal, not a hard number. Useful as narrative color for solution review. Formal measurement deferred to post-MVP when production call analytics and the framework's feedback loop are in place. | Unknown | Deferred to build | Canvas-08 | Julian Garrido Rodriguez | SME interview (qualitative) | Julian | Open |

## Answered
| ID | Answer | Evidence / source | Date | Updated in |
|---|---|---|---|---|
| G-06 | The framework will use complete call recordings from S3, not individual audio chunks. This simplifies SDK integration — Connect already stores full recordings per contact ID. | Pod decision | 2026-11-18 | PS-05 |
| G-02 | No AWS co-sell or funding alignment assumed for MVP. If a partner play emerges later it can be added, but the accelerator is scoped as customer efficiency for now. | Pod decision | 2026-11-18 | PS-03 |
| G-01 | The framework is an **orchestration layer**, not a competitor to tools like DeepEval, AgentCore evals, or Connect native analytics. Those are pluggable components the framework can consume. The unique value is extensibility: it's platform-agnostic by design (Connect first, other voice platforms later), while existing tools are tightly coupled to AWS. The framework decides *what* to test and *how* to score; the tools provide capabilities it calls. | Pod decision | 2026-11-18 | PS-01, PS-06 |
| G-12 | No off-the-shelf AWS service fits. Ground Truth and A2I are closed to new customers; Bedrock Human Eval is text-only; MTurk shut down Sept 2026. **Decision: build a lightweight custom eval UI** (S3 + CloudFront + DynamoDB) that plays Connect recordings and collects human scores on a custom rubric. This also serves as the ongoing validation tool for score consistency (G-11). | Desk research (AWS docs, Nov 2026) | 2026-11-18 | PS-04 |

## Parked
| ID | Gap | Why parked |
|---|---|---|
| G-05 | What does "good coverage" look like for voice agent testing — how many edge/adversarial cases matter? | Coverage depends on each business's specific use case and dataset. The framework will accept whatever test data the user provides; defining "good coverage" is out of scope for the framework itself. |
| G-09 | Does the new Agentic CX Designer (NLX acquisition) change the testing surface area? | Out of scope for MVP. Focus is on Connect agents, not Agentic CX Designer. To be confirmed with the team. |

## SME interview prep

### Julian Garrido Rodriguez (Amazon Connect practice, Slalom)
- G-03: How many test calls do you typically make per agent change? What does a typical testing session look like?
- G-04: End to end, from making a change to being confident it works — how long does that take?
- G-11: When you evaluate a voice agent response, what's "good enough"? How would you define the tolerance for an automated scorer vs. your own judgment?

### Jamie / Jake (SGI leadership)
- G-01: What existing tools or accelerators overlap with this? Where's the gap?
- G-10: Who should try this first — a current Connect engagement, Julian's team, or a specific customer?

### AWS Bedrock / Connect / AI team
- G-08: What's the state of the art for evaluating voice-specific quality (pronunciation, timing, natural-sounding responses) programmatically?
- G-13: How well do current Bedrock models handle audio input for evaluation tasks? What are the known limitations on pronunciation/cadence/tone judgment?
