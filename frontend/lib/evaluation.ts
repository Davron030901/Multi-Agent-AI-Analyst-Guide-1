import type { AgentName } from "./agents";

/* ===========================================================================
   Evaluation fixtures.

   Replace with the output of `python -m eval.run_eval`, which writes
   backend/eval/results/latest.md and a matching .json. The shape below mirrors
   that JSON so swapping in a real run is a copy, not a rewrite.
   =========================================================================== */

export interface Metric {
  id: string;
  label: string;
  help: string;
  withCritic: number;
  withoutCritic: number;
  /** 1–5 metrics are scaled differently from the 0–1 ones. */
  scale: 1 | 5;
  /** Lower is better for latency. */
  lowerIsBetter?: boolean;
}

export const METRICS: Metric[] = [
  {
    id: "faithfulness",
    label: "Faithfulness",
    help: "Share of claims that the retrieved evidence actually supports.",
    withCritic: 0.94,
    withoutCritic: 0.78,
    scale: 1,
  },
  {
    id: "answer_relevancy",
    label: "Answer relevancy",
    help: "How directly the answer addresses what was asked.",
    withCritic: 0.91,
    withoutCritic: 0.86,
    scale: 1,
  },
  {
    id: "context_precision",
    label: "Context precision",
    help: "Share of retrieved passages that were worth retrieving.",
    withCritic: 0.83,
    withoutCritic: 0.79,
    scale: 1,
  },
  {
    id: "context_recall",
    label: "Context recall",
    help: "Share of the evidence needed that was actually retrieved.",
    withCritic: 0.88,
    withoutCritic: 0.71,
    scale: 1,
  },
  {
    id: "judge",
    label: "Judge score",
    help: "A stronger model grading each answer 1–5 against a reference.",
    withCritic: 4.4,
    withoutCritic: 3.6,
    scale: 5,
  },
  {
    id: "exact_facts",
    label: "Exact-fact rate",
    help: "Deterministic check: does the answer contain the correct figures?",
    withCritic: 0.93,
    withoutCritic: 0.71,
    scale: 1,
  },
];

export const RUN_META = {
  questions: 14,
  breakdown: "4 document · 6 SQL · 1 web · 3 multi-hop",
  model: "gpt-4o-mini + Gemini embeddings",
  medianLatencyWith: 12.4,
  medianLatencyWithout: 8.1,
};

export type Culprit =
  | "mis-routed"
  | "bad SQL"
  | "code error"
  | "retrieval miss"
  | "critic passed a bad answer";

export const CULPRIT_AGENT: Record<Culprit, AgentName> = {
  "mis-routed": "supervisor",
  "bad SQL": "data",
  "code error": "code",
  "retrieval miss": "retriever",
  "critic passed a bad answer": "critic",
};

export interface Failure {
  id: string;
  question: string;
  culprit: Culprit;
  what: string;
  fix: string;
}

export const FAILURES: Failure[] = [
  {
    id: "multi-03",
    question: "Does our average P1 resolution time meet the SLA target?",
    culprit: "mis-routed",
    what:
      "Read as a policy question, so only the retriever ran. The 8-hour target came back; the measured 9.75 hours never did, and the answer compared nothing to nothing.",
    fix: "Teach the supervisor that a comparison needs both sides — a documented target and a measured value — before it may finish.",
  },
  {
    id: "multi-02",
    question: "What percentage of active MRR did we lose to churn in Q2 2026?",
    culprit: "code error",
    what:
      "The SQL result crossed into the code agent as a stringified tuple. With two columns in an unexpected order the snippet hardcoded the wrong operand and printed a confident 0.09%.",
    fix: "Pass named values between agents, not prose. Add a MISSING sentinel so a wrong pick fails loudly instead of computing something plausible.",
  },
  {
    id: "doc-01",
    question: "Why did the MISSING_FEATURE accounts leave?",
    culprit: "retrieval miss",
    what:
      "The question used the database's vocabulary. The screaming-snake-case token embedded closest to the one-line dictionary entry, not to the prose that actually explains the gap.",
    fix: "Expand reason codes to their natural-language gloss before searching. Measure the change in context recall.",
  },
  {
    id: "sql-04",
    question: "How many active subscriptions and what is total active MRR?",
    culprit: "bad SQL",
    what:
      "The generated query counted churned rows as active because it filtered on subscriptions.end_date IS NULL rather than status.",
    fix: "State the canonical definition of 'active' in the schema prompt, and add this question to the regression set.",
  },
  {
    id: "sql-02",
    question: "How much MRR did we lose to churn in Q2 2026?",
    culprit: "critic passed a bad answer",
    what:
      "The answer rounded $7,362.00 to 'about $7,000'. Every claim was grounded, so the critic approved it — grounding is not precision.",
    fix: "Add a precision rule: when the evidence carries an exact figure, the answer must too.",
  },
];
