import type {
  AgentEvent,
  Chunk,
  CodeResult,
  SqlResult,
  Source,
} from "../events";

/* ===========================================================================
   A recorded run.

   The figures here are the real output of the seeded Northwind Cloud dataset
   (180 customers, 41 churn events), so the mock and a live backend tell the
   same story. The recording deliberately includes a critic REJECTION, because
   the revision branch is the hardest state to design and the easiest to forget.
   =========================================================================== */

export type Scenario =
  | "churn" // full run, one revision — the default
  | "sql-blocked" // read-only guard rejects a generated query
  | "code-timeout" // sandbox kills a snippet
  | "no-web-key" // optional integration absent
  | "empty-retrieval"; // documents indexed, nothing matched

export const EXAMPLE_QUESTIONS: { q: string; path: string; scenario: Scenario }[] = [
  {
    q: "How many customers churned in Q2 2026, and why did they leave?",
    path: "Database → Documents → Critic",
    scenario: "churn",
  },
  {
    q: "What share of active MRR did we lose to churn last quarter?",
    path: "Database → Code → Critic",
    scenario: "churn",
  },
  {
    q: "Does our average P1 resolution time meet the SLA we published?",
    path: "Database → Documents → Critic",
    scenario: "empty-retrieval",
  },
];

/* --------------------------------------------------------------------------
   Evidence fixtures
   -------------------------------------------------------------------------- */

const SQL_CHURN: SqlResult = {
  kind: "sql",
  query: `SELECT reason_code,
       COUNT(*)               AS customers,
       ROUND(SUM(mrr_lost),2) AS mrr_lost
FROM   churn_events
WHERE  churn_date BETWEEN '2026-04-01' AND '2026-06-30'
GROUP  BY reason_code
ORDER  BY customers DESC;`,
  columns: ["reason_code", "customers", "mrr_lost"],
  rows: [
    ["MISSING_FEATURE", 4, 5537.0],
    ["POOR_SUPPORT", 3, 443.0],
    ["PRICE", 2, 876.0],
    ["ONBOARDING_FAILURE", 2, 392.0],
    ["MERGER", 1, 114.0],
  ],
  rowCount: 5,
};

const SQL_BLOCKED: SqlResult = {
  kind: "sql",
  query: `DELETE FROM churn_events WHERE churn_date < '2026-01-01';`,
  columns: [],
  rows: [],
  rowCount: 0,
  rejected: true,
  rejectionReason:
    "Forbidden keyword 'DELETE'. This agent may only run a single read-only SELECT.",
};

const CHUNKS_CHURN: Chunk[] = [
  {
    id: "c1",
    title: "Q2 2026 churn postmortem — what we saw",
    source: "churn_postmortem_q2_2026.md",
    relevance: 0.94,
    snippet:
      "MISSING_FEATURE was the single largest driver of churn in the quarter, and by a wide margin the largest driver of lost revenue. Two gaps came up in every offboarding call: native SAP and Workday connectors, and multi-step approval branching.",
  },
  {
    id: "c2",
    title: "Q2 2026 churn postmortem — support quality",
    source: "churn_postmortem_q2_2026.md",
    relevance: 0.88,
    snippet:
      "Every account tagged POOR_SUPPORT had breached P1 targets in the 90 days before they left. The pattern is not slow first response — it is slow escalation once the first responder cannot solve the problem.",
  },
  {
    id: "c3",
    title: "Reason code dictionary",
    source: "churn_postmortem_q2_2026.md",
    relevance: 0.81,
    snippet:
      "MISSING_FEATURE — the customer needed a capability we do not ship and could not wait for it. PRICE — the customer left over cost. ONBOARDING_FAILURE — the account never reached activation (fewer than 3 live workflows at day 90).",
  },
  {
    id: "c4",
    title: "H2 2026 roadmap — Q4 commitments",
    source: "product_roadmap_h2_2026.md",
    relevance: 0.72,
    snippet:
      "Native SAP connector (S/4HANA and ECC) and native Workday connector are committed for Q4 2026. Both were named as the most-cited single blocker in MISSING_FEATURE churn events.",
  },
];

const CODE_SHARE: CodeResult = {
  kind: "code",
  ms: 84,
  source: `losses = {
    "MISSING_FEATURE": 5537.00,
    "POOR_SUPPORT":     443.00,
    "PRICE":            876.00,
    "ONBOARDING_FAILURE": 392.00,
    "MERGER":           114.00,
}
lost   = sum(losses.values())
active = 865_239.00

print(f"MRR lost      : \${lost:,.2f}")
print(f"Active MRR    : \${active:,.2f}")
print(f"Share of MRR  : {lost / active * 100:.2f}%")`,
  stdout: `MRR lost      : $7,362.00
Active MRR    : $865,239.00
Share of MRR  : 0.85%`,
  chart: {
    title: "MRR lost by reason code, Q2 2026",
    unit: "USD",
    series: [
      { label: "MISSING_FEATURE", value: 5537, hue: "var(--code)" },
      { label: "PRICE", value: 876, hue: "var(--data)" },
      { label: "POOR_SUPPORT", value: 443, hue: "var(--retriever)" },
      { label: "ONBOARDING_FAILURE", value: 392, hue: "var(--web)" },
      { label: "MERGER", value: 114, hue: "var(--critic)" },
    ],
  },
};

const CODE_TIMEOUT: CodeResult = {
  kind: "code",
  ms: 15000,
  source: `# the model wrote an unbounded search
n = 0
while True:
    n += 1`,
  stdout: "",
  failure: "timeout",
  failureDetail: "Stopped at the 15 second limit. Nothing was printed.",
};

const SOURCES: Source[] = [
  {
    n: 1,
    title: "churn_events, Q2 2026",
    origin: "database",
    detail: "5 reason codes, 12 customers, read-only SELECT",
  },
  {
    n: 2,
    title: "Q2 2026 churn postmortem",
    origin: "document",
    detail: "Section 3 — what we saw in Q2 2026",
  },
  {
    n: 3,
    title: "H2 2026 roadmap",
    origin: "document",
    detail: "Q4 commitments — SAP and Workday connectors",
  },
  {
    n: 4,
    title: "Share of active MRR",
    origin: "computed",
    detail: "7,362 / 865,239 — sandboxed Python",
  },
];

const ANSWER = `Twelve customers churned in Q2 2026, taking $7,362 of monthly recurring revenue with them — about 0.85% of active MRR [1][4].

The largest driver was MISSING_FEATURE: four accounts, but $5,537 of the loss, so three quarters of the revenue impact came from a third of the departures [1]. Two gaps appeared in every one of those offboarding calls — native SAP and Workday connectors, and multi-step approval branching [2]. Both connectors are committed for Q4 2026 [3].

POOR_SUPPORT accounts for three departures. Each had breached a P1 target in the preceding 90 days, and the cause was escalation latency rather than slow first response [2]. PRICE and ONBOARDING_FAILURE account for two each, and one account was lost to a merger [1].`;

const ANSWER_DRAFT = `Twelve customers churned in Q2 2026, losing $7,362 of MRR. The reasons were MISSING_FEATURE, POOR_SUPPORT, PRICE, ONBOARDING_FAILURE and MERGER.`;

/* --------------------------------------------------------------------------
   Timeline: [delay before emitting, event]
   -------------------------------------------------------------------------- */
type Beat = [number, AgentEvent];

const CHURN_RUN: Beat[] = [
  [220, { type: "plan", next: "data", reason: "The count has to come from the database." }],
  [140, { type: "step_start", agent: "data", step: 2 }],
  [900, { type: "evidence", agent: "data", payload: SQL_CHURN }],
  [180, { type: "step_end", agent: "data", ms: 1240, tokens: 512 }],

  [200, { type: "plan", next: "retriever", reason: "The reason codes need explaining from the postmortem." }],
  [140, { type: "step_start", agent: "retriever", step: 4 }],
  [760, { type: "evidence", agent: "retriever", payload: { kind: "chunks", chunks: CHUNKS_CHURN } }],
  [160, { type: "step_end", agent: "retriever", ms: 880, tokens: 1340 }],

  [200, { type: "plan", next: "code", reason: "The share of MRR needs exact arithmetic." }],
  [140, { type: "step_start", agent: "code", step: 6 }],
  [700, { type: "evidence", agent: "code", payload: CODE_SHARE }],
  [160, { type: "step_end", agent: "code", ms: 640, tokens: 402 }],

  [260, { type: "answer", text: ANSWER_DRAFT, sources: SOURCES.slice(0, 1) }],
  [900, {
    type: "critic",
    ok: false,
    reason:
      "The reason codes are listed but never explained, and the question asked why. Retrieve the postmortem passage that defines them.",
    revision: 1,
  }],

  [420, { type: "plan", next: "retriever", reason: "The critic wants the explanation behind each code." }],
  [140, { type: "step_start", agent: "retriever", step: 9 }],
  [700, { type: "evidence", agent: "retriever", payload: { kind: "chunks", chunks: CHUNKS_CHURN.slice(0, 3) } }],
  [160, { type: "step_end", agent: "retriever", ms: 720, tokens: 1180 }],

  [300, { type: "answer", text: ANSWER, sources: SOURCES }],
  [800, {
    type: "critic",
    ok: true,
    reason: "Every figure traces to the query, and each reason code is explained from the postmortem.",
    revision: 1,
  }],
];

const SQL_BLOCKED_RUN: Beat[] = [
  [220, { type: "plan", next: "data", reason: "This asks for a change to the data, so it goes to the SQL agent." }],
  [140, { type: "step_start", agent: "data", step: 2 }],
  [700, { type: "evidence", agent: "data", payload: SQL_BLOCKED }],
  [200, {
    type: "error",
    agent: "data",
    message: "The query was blocked before it ran.",
    hint: "The data agent is read-only at two layers: a static guard and a read-only connection. It will rewrite the query as a SELECT and try once more.",
  }],
  [400, { type: "plan", next: "data", reason: "Retrying with a read-only query." }],
  [140, { type: "step_start", agent: "data", step: 5 }],
  [800, { type: "evidence", agent: "data", payload: SQL_CHURN }],
  [160, { type: "step_end", agent: "data", ms: 1100, tokens: 604 }],
  [300, { type: "answer", text: ANSWER_DRAFT, sources: SOURCES.slice(0, 1) }],
  [700, { type: "critic", ok: true, reason: "The figures match the query result.", revision: 0 }],
];

const CODE_TIMEOUT_RUN: Beat[] = [
  [220, { type: "plan", next: "data", reason: "Start with the numbers." }],
  [140, { type: "step_start", agent: "data", step: 2 }],
  [800, { type: "evidence", agent: "data", payload: SQL_CHURN }],
  [160, { type: "step_end", agent: "data", ms: 1180, tokens: 498 }],
  [200, { type: "plan", next: "code", reason: "Now compute the share." }],
  [140, { type: "step_start", agent: "code", step: 4 }],
  [1200, { type: "evidence", agent: "code", payload: CODE_TIMEOUT }],
  [200, {
    type: "error",
    agent: "code",
    message: "The code ran out of time.",
    hint: "The sandbox stops any snippet at 15 seconds. The agent will write a simpler calculation and retry.",
  }],
  [400, { type: "plan", next: "code", reason: "Retrying with a direct calculation." }],
  [140, { type: "step_start", agent: "code", step: 7 }],
  [700, { type: "evidence", agent: "code", payload: CODE_SHARE }],
  [160, { type: "step_end", agent: "code", ms: 84, tokens: 288 }],
  [300, { type: "answer", text: ANSWER, sources: SOURCES }],
  [700, { type: "critic", ok: true, reason: "The arithmetic is verified against the sandbox output.", revision: 0 }],
];

const NO_WEB_KEY_RUN: Beat[] = [
  [220, { type: "plan", next: "web", reason: "This is outside our documents, so it needs the live web." }],
  [140, { type: "step_start", agent: "web", step: 2 }],
  [400, {
    type: "error",
    agent: "web",
    message: "Web search is off.",
    hint: "Add a Tavily key in Keys to switch it on. The supervisor will answer from your documents and database instead.",
  }],
  [400, { type: "plan", next: "retriever", reason: "Falling back to the documents we do have." }],
  [140, { type: "step_start", agent: "retriever", step: 4 }],
  [700, { type: "evidence", agent: "retriever", payload: { kind: "chunks", chunks: CHUNKS_CHURN.slice(0, 2) } }],
  [160, { type: "step_end", agent: "retriever", ms: 690, tokens: 820 }],
  [300, { type: "answer", text: ANSWER_DRAFT, sources: SOURCES.slice(1, 3) }],
  [700, {
    type: "critic",
    ok: true,
    reason: "Answered from documents only, and the answer says so rather than guessing.",
    revision: 0,
  }],
];

const EMPTY_RETRIEVAL_RUN: Beat[] = [
  [220, { type: "plan", next: "data", reason: "The measured figure comes from the database." }],
  [140, { type: "step_start", agent: "data", step: 2 }],
  [820, {
    type: "evidence",
    agent: "data",
    payload: {
      kind: "sql",
      query: `SELECT ROUND(AVG(resolved_hours), 2) AS avg_p1_hours
FROM   support_tickets
WHERE  priority = 'P1';`,
      columns: ["avg_p1_hours"],
      rows: [[9.75]],
      rowCount: 1,
    },
  }],
  [160, { type: "step_end", agent: "data", ms: 940, tokens: 366 }],
  [200, { type: "plan", next: "retriever", reason: "The published target is in the SLA policy." }],
  [140, { type: "step_start", agent: "retriever", step: 4 }],
  [700, { type: "evidence", agent: "retriever", payload: { kind: "chunks", chunks: [] } }],
  [200, {
    type: "error",
    agent: "retriever",
    message: "No matching sources.",
    hint: "Your documents are indexed but nothing matched this question. Try naming the document, or index the SLA policy.",
  }],
  [300, {
    type: "answer",
    text: "Average P1 resolution time is 9.75 hours [1]. I could not find the published SLA target in your indexed documents, so I cannot say whether that meets it — index the support SLA policy and ask again.",
    sources: [
      { n: 1, title: "support_tickets", origin: "database", detail: "AVG(resolved_hours) where priority = 'P1'" },
    ],
  }],
  [800, {
    type: "critic",
    ok: true,
    reason: "The measured figure is grounded, and the missing half is stated plainly instead of invented.",
    revision: 0,
  }],
];

const RUNS: Record<Scenario, Beat[]> = {
  churn: CHURN_RUN,
  "sql-blocked": SQL_BLOCKED_RUN,
  "code-timeout": CODE_TIMEOUT_RUN,
  "no-web-key": NO_WEB_KEY_RUN,
  "empty-retrieval": EMPTY_RETRIEVAL_RUN,
};

/** Pick a scenario from the wording of the question. */
export function scenarioFor(question: string): Scenario {
  const q = question.toLowerCase();
  if (/\b(delete|drop|update|remove all)\b/.test(q)) return "sql-blocked";
  if (/\b(sla|target|published|policy)\b/.test(q)) return "empty-retrieval";
  if (/\b(competitor|news|latest|who is|market)\b/.test(q)) return "no-web-key";
  if (/\b(simulate|monte carlo|forecast|projection)\b/.test(q)) return "code-timeout";
  return "churn";
}

export interface MockOptions {
  /** 0 replays instantly — used by tests and by reduced-motion replay. */
  speed?: number;
  signal?: AbortSignal;
}

/** Replay a recorded run as an async event stream. */
export async function* mockStream(
  question: string,
  options: MockOptions = {},
): AsyncGenerator<AgentEvent> {
  const { speed = 1, signal } = options;
  const beats = RUNS[scenarioFor(question)] ?? CHURN_RUN;

  for (const [delay, event] of beats) {
    if (signal?.aborted) return;
    if (speed > 0) await sleep(delay / speed, signal);
    if (signal?.aborted) return;
    yield event;
  }
}

/** The short loop used by the landing hero. Supervisor → data → code → critic. */
export const HERO_BEATS: Beat[] = [
  [500, { type: "plan", next: "data", reason: "The count comes from the database." }],
  [260, { type: "step_start", agent: "data", step: 2 }],
  [1100, { type: "evidence", agent: "data", payload: SQL_CHURN }],
  [260, { type: "step_end", agent: "data", ms: 1240, tokens: 512 }],
  [420, { type: "plan", next: "code", reason: "The share needs exact arithmetic." }],
  [260, { type: "step_start", agent: "code", step: 4 }],
  [1000, { type: "evidence", agent: "code", payload: CODE_SHARE }],
  [260, { type: "step_end", agent: "code", ms: 640, tokens: 402 }],
  [420, { type: "answer", text: ANSWER, sources: SOURCES }],
  [700, {
    type: "critic",
    ok: true,
    reason: "Every figure traces to the query or the sandbox output.",
    revision: 0,
  }],
];

export const HERO_QUESTION = "How many customers churned in Q2 2026, and why did they leave?";
export const HERO_HEADLINE_NUMBER = "12";
export const HERO_HEADLINE_UNIT = "customers, $7,362 of MRR";

export async function* heroStream(signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  for (const [delay, event] of HERO_BEATS) {
    if (signal?.aborted) return;
    await sleep(delay, signal);
    if (signal?.aborted) return;
    yield event;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}
