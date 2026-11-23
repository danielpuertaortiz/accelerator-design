const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
  PageBreak, Footer, Header, TabStopPosition, TabStopType,
  PageNumber, NumberFormat
} = require("docx");
const fs = require("fs");

const DARK_BLUE = "002FAF";
const BLUE = "0C62FB";
const CYAN = "1BE1F2";
const WHITE = "FFFFFF";
const LIGHT_GRAY = "E6E6E6";
const TINT = "E6EFFF";
const INK = "111111";
const GRAY = "666666";
const FONT = "Arial";

// Helper to make a styled text run
function t(text, opts = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size || 22,
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || INK,
    ...(opts.break ? { break: opts.break } : {}),
  });
}

// Helper for a body paragraph
function p(text, opts = {}) {
  const runs = typeof text === "string" ? [t(text, opts)] : text;
  return new Paragraph({
    children: runs,
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: opts.line ?? 276 },
    alignment: opts.alignment || AlignmentType.LEFT,
    ...(opts.heading ? { heading: opts.heading } : {}),
    ...(opts.indent ? { indent: opts.indent } : {}),
    ...(opts.border ? { border: opts.border } : {}),
  });
}

// Section heading (blue)
function sectionHeading(text) {
  return new Paragraph({
    children: [t(text, { bold: true, size: 28, color: DARK_BLUE })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: BLUE } },
  });
}

// Sub heading
function subHeading(text) {
  return new Paragraph({
    children: [t(text, { bold: true, size: 24, color: BLUE })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
  });
}

// Bold label + normal text on same line
function labelLine(label, text, opts = {}) {
  return new Paragraph({
    children: [
      t(label, { bold: true, size: 22, color: opts.labelColor || INK }),
      t("  " + text, { size: 22 }),
    ],
    spacing: { after: 80 },
  });
}

// Bullet point
function bullet(text, opts = {}) {
  const runs = typeof text === "string" ? [t(text, { size: 22, ...opts })] : text;
  return new Paragraph({
    children: runs,
    spacing: { after: 60 },
    indent: { left: 360, hanging: 180 },
  });
}

// Simple table cell
function cell(text, opts = {}) {
  const runs = typeof text === "string"
    ? [new Paragraph({ children: [t(text, { size: opts.headerSize || 20, bold: opts.bold || false, color: opts.color || INK })], spacing: { after: 40, before: 40 } })]
    : [new Paragraph({ children: text, spacing: { after: 40, before: 40 } })];
  return new TableCell({
    children: runs,
    width: { size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    verticalAlign: opts.vAlign || "center",
  });
}

// 3x3 summary table
const TABLE_WIDTH = 9360; // 6.5" usable
const COL_W = 3120;

const summaryTable = new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: [COL_W, COL_W, COL_W],
  rows: [
    new TableRow({
      children: [
        cell("1 · Problem", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("2 · Customer Segments", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("3 · UVP", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
      ],
    }),
    new TableRow({
      children: [
        cell("Human bottleneck, chat misses voice defects, edge cases untested", { width: COL_W }),
        cell("Dev leads building Connect agents; enterprise eng managers", { width: COL_W }),
        cell("Voice agent testing that hears what chat tests can't — 10x volume", { width: COL_W }),
      ],
    }),
    new TableRow({
      children: [
        cell("4 · Solution", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("5 · Competitive Landscape", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("6 · GTM Strategy", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
      ],
    }),
    new TableRow({
      children: [
        cell("Scenario generator, eval runner, voice scorer, scorecard, eval UI", { width: COL_W }),
        cell("Manual testing, chat tester, DeepEval, AgentCore — none voice-native", { width: COL_W }),
        cell("Slalom delivery engagements → reusable accelerator → customer-facing", { width: COL_W }),
      ],
    }),
    new TableRow({
      children: [
        cell("7 · Level of Effort", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("8 · Key Metrics", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
        cell("9 · Differentiation", { width: COL_W, bold: true, shading: TINT, color: DARK_BLUE }),
      ],
    }),
    new TableRow({
      children: [
        cell("~9–13 weeks MVP; 5–7 months at part-time capacity", { width: COL_W }),
        cell("10x test volume, 80% cycle reduction, ≥0.90 consistency", { width: COL_W }),
        cell("Voice-native eval, end-to-end orchestration, platform-extensible", { width: COL_W }),
      ],
    }),
  ],
});

// Competitive landscape table
const COMP_COL = [2800, 1600, 3360, 1600];
const compTable = new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: COMP_COL,
  rows: [
    new TableRow({
      children: [
        cell("Alternative", { width: COMP_COL[0], bold: true, shading: DARK_BLUE, color: WHITE }),
        cell("Type", { width: COMP_COL[1], bold: true, shading: DARK_BLUE, color: WHITE }),
        cell("Gap for our segment", { width: COMP_COL[2], bold: true, shading: DARK_BLUE, color: WHITE }),
        cell("Source", { width: COMP_COL[3], bold: true, shading: DARK_BLUE, color: WHITE }),
      ],
    }),
    ...[
      ["Manual phone testing", "Status quo", "Doesn't scale — caps at a handful of tests per change", "Julian"],
      ["Connect chat test tool", "Built-in", "Text only. Misses pronunciation, timing, cadence, tone", "Julian"],
      ["Contact search + transcripts", "Built-in", "Post-hoc and reactive. Finds problems after customers experience them", "Julian"],
      ["DeepEval", "OSS framework", "Not voice-native. Evaluates text, not audio quality", "Julian"],
      ["AgentCore evals", "Slalom internal", "Does not support voice. Text/chat only", "Pod research"],
      ["CloudWatch + LLM via Miro", "Manual", "Ad-hoc, no repeatability, no scoring rubric", "Julian"],
      ["Agentic CX Designer", "AWS (new)", "Limited, platform-tied, no testing focus", "Jake"],
    ].map((row, i) =>
      new TableRow({
        children: row.map((val, j) =>
          cell(val, { width: COMP_COL[j], shading: i % 2 === 0 ? TINT : WHITE })
        ),
      })
    ),
  ],
});

// Solution table
const SOL_COL = [3200, 6160];
const solutionTable = new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: SOL_COL,
  rows: [
    new TableRow({
      children: [
        cell("Problem", { width: SOL_COL[0], bold: true, shading: DARK_BLUE, color: WHITE }),
        cell("Capability", { width: SOL_COL[1], bold: true, shading: DARK_BLUE, color: WHITE }),
      ],
    }),
    ...[
      ["Manual test creation is slow and inconsistent", "Scenario generator — auto-generate from Connect flow definitions, transcripts, and KB content"],
      ["Every test requires a human on a phone call", "Eval runner — direct API calls; Gemini for audio, Bedrock for text assertions"],
      ["Voice quality can only be judged by listening", "Voice quality scorer — Gemini API on audio for pronunciation, cadence, tone, timing"],
      ["Results scattered across logs and transcripts", "Scorecard and reporting — unified pass/fail dashboard with regression tracking"],
      ["No baseline for \"good enough\"", "Human eval UI — per-turn defect flagging on transcriptions; baselines + calibration"],
    ].map((row, i) =>
      new TableRow({
        children: row.map((val, j) =>
          cell(val, { width: SOL_COL[j], shading: i % 2 === 0 ? TINT : WHITE })
        ),
      })
    ),
  ],
});

// Metrics table
const MET_COL = [2000, 1200, 1800, 1800, 2560];
const metricsTable = new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: MET_COL,
  rows: [
    new TableRow({
      children: ["Metric", "Category", "Baseline", "Target", "How measured"].map((h, j) =>
        cell(h, { width: MET_COL[j], bold: true, shading: DARK_BLUE, color: WHITE })
      ),
    }),
    ...[
      ["Test scenarios generated", "Adoption", "TBD (G-03)", "10x manual", "Count automated vs. manual"],
      ["Time to test a change", "Efficiency", "TBD (G-04)", "80% reduction", "Wall-clock comparison"],
      ["Edge case coverage", "Quality", "Near zero", "50+ scenarios", "Count per run"],
      ["Score consistency", "Reliability", "TBD (G-11)", ">=0.90", "N-run variance test"],
      ["False negatives", "Guardrail", "TBD (G-14)", "<=5%", "Post-MVP sampling loop"],
      ["Conversation defect rate", "Quality", "TBD", "Trend down", "Flagged turns / total turns"],
      ["Human eval throughput", "Baseline", "N/A", "50 rec/hr", "Eval UI metrics"],
    ].map((row, i) =>
      new TableRow({
        children: row.map((val, j) =>
          cell(val, { width: MET_COL[j], shading: i % 2 === 0 ? TINT : WHITE, headerSize: 18 })
        ),
      })
    ),
  ],
});

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: INK },
        paragraph: { spacing: { after: 120, line: 276 } },
      },
      heading1: {
        run: { font: FONT, size: 28, bold: true, color: DARK_BLUE },
        paragraph: { spacing: { before: 360, after: 160 }, keepNext: true },
      },
      heading2: {
        run: { font: FONT, size: 24, bold: true, color: BLUE },
        paragraph: { spacing: { before: 240, after: 100 }, keepNext: true },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, bottom: 1080, left: 1440, right: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [t("Slalom  ·  Accelerator Solution Design  ·  Step 2 of 5", { size: 16, color: GRAY })],
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 1, color: LIGHT_GRAY, space: 4 } },
            }),
          ],
        }),
      },
      children: [
        // ===== PAGE 1: COVER =====
        // Eyebrow
        p("PRODUCT CANVAS  ·  STEP 2 OF 5", { size: 18, color: BLUE, bold: true, after: 60 }),

        // Title
        new Paragraph({
          children: [t("AI Voice Testing", { bold: true, size: 52, color: DARK_BLUE })],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [t("Product Canvas", { bold: true, size: 36, color: BLUE })],
          spacing: { after: 240 },
        }),

        // Pod + date
        labelLine("Pod:", "Daniel Puerta, Adrian Gutierrez Rodriguez"),
        labelLine("Date:", "November 23, 2026"),
        labelLine("Status:", "Ready for PRD"),
        labelLine("Platform:", "AWS (Amazon Connect)"),
        labelLine("Value play:", "Customer efficiency"),
        p("", { after: 200 }),

        // UVP callout box (shaded paragraph)
        new Paragraph({
          children: [
            t("UNIQUE VALUE PROPOSITION", { bold: true, size: 18, color: CYAN }),
          ],
          spacing: { before: 0, after: 60 },
          shading: { type: ShadingType.CLEAR, fill: DARK_BLUE },
          indent: { left: 180, right: 180 },
        }),
        new Paragraph({
          children: [
            t("One automated framework to generate, execute, and score voice agent tests at scale — so teams catch pronunciation, timing, and conversational defects before customers hear them.", { size: 24, bold: true, color: WHITE }),
          ],
          spacing: { before: 0, after: 200 },
          shading: { type: ShadingType.CLEAR, fill: DARK_BLUE },
          indent: { left: 180, right: 180 },
        }),

        // 3x3 Summary
        subHeading("Canvas at a glance"),
        summaryTable,

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // ===== BLOCK 1: PROBLEM =====
        sectionHeading("1 · Problem"),
        p([
          t("1. Human bottleneck on voice evaluation", { bold: true }),
          t(" — Every voice response must be heard by a person to evaluate pronunciation, timing, cadence, and conversational quality. This caps test volume at a handful of calls per change."),
        ]),
        p([
          t("2. Chat tests miss voice defects", { bold: true }),
          t(" — Text-based alternatives (Connect's chat tester, transcript review) look fine on screen but miss how responses actually sound. \"8880\" reads correctly but sounds wrong spoken aloud."),
        ]),
        p([
          t("3. Edge and adversarial cases go untested", { bold: true }),
          t(" — Because each test requires a human on a call, teams can't cover the long tail of scenarios — accent variations, interruptions, ambiguous intents, noisy environments — leaving regressions undiscovered until production."),
        ]),
        p(""),
        p([
          t("How it's solved today: ", { bold: true }),
          t("Manual phone calls one at a time, Connect's built-in chat test tool (text only), post-hoc transcript and log review in the Connect console, CloudWatch logs pasted into LLMs via Miro for diagnosis, and early adoption of DeepEval (not voice-native). Julian confirmed: \"it's a lot of manual testing.\""),
        ]),

        // ===== BLOCK 2: SEGMENTS =====
        sectionHeading("2 · Customer Segments"),
        labelLine("Users:", "Dev leads and engineers who build voice and chat agents in Amazon Connect — they configure instructions, actions, knowledge bases, guardrails, and handoff rules. (Persona: \"Rosa, dev lead\")"),
        labelLine("Buyers / sponsors:", "Engineering managers and contact center leaders at enterprises deploying AI voice agents — they own release quality and velocity."),
        p(""),
        p([t("Beneficiaries:", { bold: true })]),
        p([t("Customer", { bold: true }), t(" — Enterprise teams who need confidence their voice agents work correctly before going live")], { indent: { left: 360 } }),
        p([t("Slalom", { bold: true }), t(" — Delivery teams building Connect solutions; high demand, low capacity in voice AI (Jamie)")], { indent: { left: 360 } }),
        p([t("AWS", { bold: true }), t(" — Amazon Connect team and field; Julian's team confirmed the pain is real")], { indent: { left: 360 } }),
        p(""),
        labelLine("Early adopters:", "[TBD — G-10] Candidates: Julian's Connect practice team at Slalom, an active Slalom Connect delivery engagement, or a customer team that just shipped a voice agent and felt the testing pain. Jamie/Jake to identify."),

        // ===== BLOCK 3: UVP =====
        sectionHeading("3 · Unique Value Proposition"),
        p([
          t("One line: ", { bold: true }),
          t("Automated voice agent testing that hears what chat tests can't — catch pronunciation, timing, and conversational defects at 10x the volume before customers do."),
        ]),
        p(""),
        p([t("Value by audience:", { bold: true })]),
        p([t("Customer: ", { bold: true, color: BLUE }), t("Ship voice agents with confidence. Cover adversarial and edge cases that manual testing misses. Catch regressions before they reach callers.")], { indent: { left: 360 } }),
        p([t("Slalom: ", { bold: true, color: BLUE }), t("Faster delivery (automated testing shortens the test cycle on Connect engagements) + differentiated offering (\"we have automated voice testing, competitors don't\" is a win-rate lever for Connect pursuits).")], { indent: { left: 360 } }),
        p([t("AWS: ", { bold: true, color: BLUE }), t("Strengthens the Connect ecosystem. Addresses a confirmed pain point in the platform's adoption path.")], { indent: { left: 360 } }),

        // ===== BLOCK 4: SOLUTION =====
        sectionHeading("4 · Solution"),
        p("All architecture decisions resolved. Hybrid model: Gemini API for audio evaluation, Bedrock for text-based assertions."),
        p(""),
        solutionTable,

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // ===== BLOCK 5: COMPETITIVE LANDSCAPE =====
        sectionHeading("5 · Competitive Landscape"),
        compTable,
        p(""),
        p([
          t("Positioning: ", { bold: true }),
          t("The framework is an orchestration layer, not a competitor to these tools. DeepEval, AgentCore, and Connect analytics are pluggable components it can consume. The unique value is end-to-end voice testing — from scenario generation through voice execution to audio quality scoring — which no single tool covers today."),
        ]),

        // ===== BLOCK 6: GTM =====
        sectionHeading("6 · GTM Strategy"),
        p([t("Route to market: ", { bold: true }), t("Slalom delivery engagements → embedded in Connect projects as a testing accelerator. Not a standalone product sale.")]),
        p(""),
        p([t("Phase 1 (internal): ", { bold: true }), t("Pod builds MVP. Validate with Julian's team or an active Connect engagement.")], { indent: { left: 360 } }),
        p([t("Phase 2 (Slalom-wide): ", { bold: true }), t("Package as a reusable accelerator for all Slalom Connect delivery teams. Shortens project timelines → more projects per quarter.")], { indent: { left: 360 } }),
        p([t("Phase 3 (customer-facing): ", { bold: true }), t("Offer as a differentiated capability in Connect proposals. \"Automated voice agent testing included\" as a win-rate lever.")], { indent: { left: 360 } }),
        p(""),
        p([t("Value levers:", { bold: true })]),
        p("Delivery efficiency — Reduce testing time per agent change by an order of magnitude", { indent: { left: 360 } }),
        p("Win rate — Differentiated testing capability competitors don't offer", { indent: { left: 360 } }),
        p("Reusability — Same framework across engagements, amortizing build cost", { indent: { left: 360 } }),
        p(""),
        p([t("Pricing model: ", { bold: true }), t("No direct pricing for MVP. Value captured through faster delivery and higher win rate. Future: potential AWS Marketplace listing or customer licensing if demand warrants.")]),

        // ===== BLOCK 7: LEVEL OF EFFORT =====
        sectionHeading("7 · Level of Effort"),
        p([t("MVP build (with AI coding tools): ~9–13 weeks", { bold: true })]),
        p("Scenario generator (Connect flow parser + transcript analyzer): ~1.5–2 weeks", { indent: { left: 360 } }),
        p("Eval runner (direct API, hybrid model split): ~2–3 weeks", { indent: { left: 360 } }),
        p("Voice quality scorer (Gemini API for audio + Bedrock for text): ~2–3 weeks", { indent: { left: 360 } }),
        p("Scorecard / reporting: ~1–1.5 weeks", { indent: { left: 360 } }),
        p("Human eval UI (baseline collection + per-turn defect flagging): ~1–1.5 weeks", { indent: { left: 360 } }),
        p("Integration and testing: ~1–2 weeks", { indent: { left: 360 } }),
        p(""),
        p([t("Capacity: ", { bold: true }), t("~5 hrs/week per builder (2 builders). At that rate, MVP is roughly 5–7 months. Solution review week of Dec 7; build starts January.")]),
        p(""),
        p([t("Run-cost drivers:", { bold: true })]),
        p("Google Gemini API calls for audio evaluation (per-recording, voice quality assertions)", { indent: { left: 360 } }),
        p("Bedrock model invocations for text-based assertions (per-recording)", { indent: { left: 360 } }),
        p("S3 storage for recordings and test artifacts", { indent: { left: 360 } }),
        p("DynamoDB for eval UI and scorecard data", { indent: { left: 360 } }),
        p(""),
        p([t("Support owner: ", { bold: true }), t("Pod (Daniel + Adrian) through MVP. Handoff plan TBD for Slalom-wide adoption.")]),

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // ===== BLOCK 8: KEY METRICS =====
        sectionHeading("8 · Key Metrics"),
        p([t("Baseline collection plan:", { bold: true })]),
        p([t("Before solution review (Dec 7): ", { bold: true }), t("Julian interview → G-03 (test volume) and G-04 (cycle time).")], { indent: { left: 360 } }),
        p([t("During build phase: ", { bold: true }), t("Technical spike → G-11 (score consistency). Run the same recordings through the scorer multiple times; measure run-to-run variance.")], { indent: { left: 360 } }),
        p([t("Post-MVP: ", { bold: true }), t("G-14 (production escapes). Requires production call analytics and a feedback loop.")], { indent: { left: 360 } }),
        p(""),
        metricsTable,

        // ===== BLOCK 9: DIFFERENTIATION =====
        sectionHeading("9 · Differentiation"),
        p([t("1. Voice-native evaluation", { bold: true }), t(" — Every alternative evaluates text. This framework evaluates what the caller actually hears: pronunciation, timing, cadence, and conversational quality on real audio.")]),
        p([t("2. End-to-end orchestration", { bold: true }), t(" — Single framework covers scenario generation → voice execution → audio scoring → reporting. No stitching together manual steps or separate tools.")]),
        p([t("3. Platform-extensible by design", { bold: true }), t(" — Connect is the beachhead, but the architecture separates platform-specific adapters from platform-agnostic capabilities. Extending to Genesys, Twilio, etc. means writing a new adapter, not rebuilding.")]),
        p([t("4. Human-calibrated scoring", { bold: true }), t(" — The custom eval UI produces ongoing human baselines, so automated scores stay validated against real human judgment.")]),
        p([t("5. Slalom delivery moat", { bold: true }), t(" — Reusable across engagements. Expertise accumulates in the framework's design and the team's know-how — but customer data is never shared or pooled. Each engagement's data stays with that customer.")]),

        // ===== COHERENCE CHECK =====
        sectionHeading("Coherence Check"),
        p([t("[x]", { bold: true, color: BLUE }), t(" Features <-> problems — Each problem in block 1 maps to a specific capability in block 4")]),
        p([t("[x]", { bold: true, color: BLUE }), t(" UVP <-> early adopters — UVP speaks to dev leads building Connect agents; early adopters are exactly that audience")]),
        p([t("[ ]", { bold: true, color: "CC6600" }), t(" Effort <-> capacity — 9–13 weeks of work at 5 hrs/week = 5–7 months. More realistic with AI coding tools, but still tight on part-time capacity. Prioritization may still be needed.")]),
        p([t("[x]", { bold: true, color: BLUE }), t(" Metrics <-> UVP — \"10x volume\" and \"score consistency\" directly validate the UVP claims")]),

        // ===== RISKIEST ASSUMPTION =====
        sectionHeading("Riskiest Assumption"),
        new Paragraph({
          children: [
            t("Can Google Gemini reliably evaluate voice quality from audio?", { bold: true, size: 24, color: WHITE }),
          ],
          spacing: { before: 120, after: 60 },
          shading: { type: ShadingType.CLEAR, fill: DARK_BLUE },
          indent: { left: 180, right: 180 },
        }),
        new Paragraph({
          children: [
            t("The hybrid architecture decision (G-15) commits to Gemini for voice_quality assertions. But we haven't validated that Gemini's audio interpretation produces scores on pronunciation, cadence, tone, and timing that are consistent run-to-run (G-11) and meaningful enough to replace human listeners. If Gemini's audio evaluation isn't reliable, the voice-native UVP collapses back to text-only — the same gap every competitor has. Must spike before build starts in January.", { size: 22, color: WHITE }),
          ],
          spacing: { before: 0, after: 200 },
          shading: { type: ShadingType.CLEAR, fill: DARK_BLUE },
          indent: { left: 180, right: 180 },
        }),
        p([
          t("Previous riskiest (resolved): ", { bold: true, italics: true, color: GRAY }),
          t("G-13 / G-15 — whether Bedrock could handle audio evaluation. Answer: no. Decision: hybrid architecture with Gemini for audio, Bedrock for text.", { italics: true, color: GRAY }),
        ]),

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // ===== APPENDIX: OPEN GAPS =====
        sectionHeading("Appendix: Open Gaps"),
        p("4 open gaps remaining. 0 blocking solution review.", { color: GRAY }),
        p(""),

        subHeading("G-03 — Manual testing volume baseline"),
        p("What does manual voice agent testing volume look like today — how many test calls per agent change?"),
        p([t("Priority: ", { bold: true }), t("Before solution review")]),
        p([t("Who: ", { bold: true }), t("Julian Garrido Rodriguez")]),
        p([t("Method: ", { bold: true }), t("SME interview")]),
        p(""),

        subHeading("G-04 — Manual cycle time baseline"),
        p("How long does it take to manually test a voice agent change end-to-end (call + log analysis + fix cycle)?"),
        p([t("Priority: ", { bold: true }), t("Before solution review")]),
        p([t("Who: ", { bold: true }), t("Julian Garrido Rodriguez")]),
        p([t("Method: ", { bold: true }), t("SME interview")]),
        p(""),

        subHeading("G-10 — Early adopters"),
        p("Who are the early adopters — Julian's team, a specific Slalom engagement, or a customer team?"),
        p([t("Priority: ", { bold: true }), t("Before build")]),
        p([t("Who: ", { bold: true }), t("Jamie, Jake, Julian")]),
        p([t("Method: ", { bold: true }), t("SME interview")]),
        p(""),

        subHeading("G-11 — Score consistency tolerance"),
        p("What level of evaluator reproducibility is acceptable? Same conversation, same agent, same prompt, same model, same config — the output should be nearly identical each run. What's the tolerance for run-to-run variance?"),
        p([t("Priority: ", { bold: true }), t("Before build")]),
        p([t("Who: ", { bold: true }), t("Pod + Julian")]),
        p([t("Method: ", { bold: true }), t("Technical spike (run same recording N times, measure score variance)")]),
      ],
    },
  ],
});

const OUTPUT = "/Users/danielpuerta/accelerator-design/ai-voice-testing/exports/AI-Voice-Testing_Product-Canvas.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("Written to", OUTPUT);
});
