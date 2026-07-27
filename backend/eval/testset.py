"""F11 - The fixed evaluation test set.

14 questions spanning every specialist plus multi-hop combinations. Reference
answers are the ground truth produced by the deterministic seed
(``python -m ingestion.seed_db`` prints exactly these figures), so a wrong number
is unambiguously wrong - not a matter of opinion.

Question types
--------------
``doc``       answerable from the document corpus alone       -> retriever
``sql``       answerable from the database alone              -> data
``web``       needs external information                      -> web
``multihop``  needs two or more agents                        -> data + retriever/code
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal

QuestionType = Literal["doc", "sql", "web", "multihop"]


@dataclass(frozen=True)
class EvalCase:
    id: str
    question: str
    qtype: QuestionType
    reference: str
    expected_agents: List[str] = field(default_factory=list)
    # Substrings that MUST appear in a correct answer. Used for a cheap,
    # deterministic exact-fact check alongside the LLM judge.
    must_contain: List[str] = field(default_factory=list)


TEST_SET: List[EvalCase] = [
    # ---------------- document-only ----------------------------------------
    EvalCase(
        id="doc-01",
        question="What are our churn reason codes, and what does each one mean?",
        qtype="doc",
        reference=(
            "There are seven reason codes: MISSING_FEATURE (needed a capability we do not ship), "
            "PRICE (left over cost, list price or a renewal increase, or a cheaper competitor), "
            "POOR_SUPPORT (service quality: SLA breaches, unanswered escalations, repeat P1s), "
            "BUDGET_CUT (budget frozen or cut, not a product judgement), "
            "ONBOARDING_FAILURE (never reached activation - fewer than 3 live workflows at day 90), "
            "MIGRATED_INHOUSE (built an internal replacement), and "
            "MERGER (acquired, and the acquirer standardised on a different vendor)."
        ),
        expected_agents=["retriever"],
        must_contain=["MISSING_FEATURE", "PRICE", "POOR_SUPPORT", "ONBOARDING_FAILURE"],
    ),
    EvalCase(
        id="doc-02",
        question="What is our P1 support SLA - first response and resolution targets?",
        qtype="doc",
        reference=(
            "P1 (Critical) has a 1-hour first-response target, 24/7, and an 8-hour resolution "
            "target, with escalation to Tier 2 and the on-call engineer at 4 hours."
        ),
        expected_agents=["retriever"],
        must_contain=["1 hour", "8"],
    ),
    EvalCase(
        id="doc-03",
        question="What is committed on the Q4 2026 product roadmap?",
        qtype="doc",
        reference=(
            "Q4 2026 commits three items: a native SAP connector (S/4HANA and ECC), a native "
            "Workday connector, and a usage-based pricing option billed on task runs as an "
            "alternative to per-seat pricing."
        ),
        expected_agents=["retriever"],
        must_contain=["SAP", "Workday"],
    ),
    EvalCase(
        id="doc-04",
        question="How much does the Scale plan cost per seat, and what is its seat limit?",
        qtype="doc",
        reference="The Scale plan is $89 per seat per month with a 250-seat limit.",
        expected_agents=["retriever"],
        must_contain=["89", "250"],
    ),
    # ---------------- SQL-only ---------------------------------------------
    EvalCase(
        id="sql-01",
        question="How many customers churned in Q2 2026?",
        qtype="sql",
        reference="12 customers churned in Q2 2026 (1 April - 30 June 2026).",
        expected_agents=["data"],
        must_contain=["12"],
    ),
    EvalCase(
        id="sql-02",
        question="How much MRR did we lose to churn in Q2 2026?",
        qtype="sql",
        reference="$7,362.00 of MRR was lost to churn in Q2 2026.",
        expected_agents=["data"],
        must_contain=["7362", "7,362"],
    ),
    EvalCase(
        id="sql-03",
        question="Give me the breakdown of Q2 2026 churn by reason code.",
        qtype="sql",
        reference=(
            "Q2 2026 churn by reason code: MISSING_FEATURE 4, POOR_SUPPORT 3, PRICE 2, "
            "ONBOARDING_FAILURE 2, MERGER 1 - 12 in total."
        ),
        expected_agents=["data"],
        must_contain=["MISSING_FEATURE", "4"],
    ),
    EvalCase(
        id="sql-04",
        question="How many active subscriptions do we have, and what is the total active MRR?",
        qtype="sql",
        reference="There are 139 active subscriptions with a total active MRR of $865,239.00.",
        expected_agents=["data"],
        must_contain=["139"],
    ),
    EvalCase(
        id="sql-05",
        question="Which customer segment has churned the most, all time?",
        qtype="sql",
        reference=(
            "SMB, with 29 churned accounts, ahead of Mid-Market with 12. Enterprise has "
            "not churned a single account."
        ),
        expected_agents=["data"],
        must_contain=["SMB", "29"],
    ),
    EvalCase(
        id="sql-06",
        question="What is the average resolution time in hours for P1 support tickets?",
        qtype="sql",
        reference="The average P1 resolution time is approximately 9.75 hours.",
        expected_agents=["data"],
        must_contain=["9.7"],
    ),
    # ---------------- web ---------------------------------------------------
    EvalCase(
        id="web-01",
        question="What is LangGraph, and which company maintains it?",
        qtype="web",
        reference=(
            "LangGraph is an open-source framework for building stateful, graph-structured "
            "multi-agent and agentic LLM applications. It is maintained by LangChain."
        ),
        expected_agents=["web"],
        must_contain=["LangChain"],
    ),
    # ---------------- multi-hop --------------------------------------------
    EvalCase(
        id="multi-01",
        question="How many customers churned in Q2 2026, and why did they leave?",
        qtype="multihop",
        reference=(
            "12 customers churned in Q2 2026, losing $7,362 of MRR. MISSING_FEATURE was the "
            "largest driver (4 accounts) and by far the largest share of lost revenue - the two "
            "specific gaps were native SAP/Workday connectors and multi-step approval branching. "
            "POOR_SUPPORT followed with 3, driven by P1 escalation latency; then PRICE with 2, "
            "ONBOARDING_FAILURE with 2 and MERGER with 1."
        ),
        expected_agents=["data", "retriever"],
        must_contain=["12", "MISSING_FEATURE"],
    ),
    EvalCase(
        id="multi-02",
        question=(
            "What percentage of our total active MRR did we lose to churn in Q2 2026? "
            "Show the calculation."
        ),
        qtype="multihop",
        reference=(
            "$7,362 lost against $865,239 of active MRR is approximately 0.85% "
            "(7362 / 865239 = 0.0085)."
        ),
        expected_agents=["data", "code"],
        must_contain=["0.8"],
    ),
    EvalCase(
        id="multi-03",
        question=(
            "Does our actual average P1 ticket resolution time meet the resolution target "
            "in our support SLA policy?"
        ),
        qtype="multihop",
        reference=(
            "No. The SLA policy sets an 8-hour P1 resolution target, but the actual average P1 "
            "resolution time is about 9.75 hours, so we are breaching the target by roughly 1.75 "
            "hours on average. The policy attributes this to escalation latency rather than slow "
            "first response, and commits to a hard 4-hour auto-escalation timer in Q3 2026."
        ),
        expected_agents=["data", "retriever"],
        must_contain=["8", "9.7"],
    ),
]


def by_type(qtype: QuestionType) -> List[EvalCase]:
    return [c for c in TEST_SET if c.qtype == qtype]


def quick_subset() -> List[EvalCase]:
    """A 6-question smoke subset - useful when conserving free-tier quota."""
    wanted = {"doc-01", "doc-02", "sql-01", "sql-03", "multi-01", "multi-02"}
    return [c for c in TEST_SET if c.id in wanted]


__all__ = ["TEST_SET", "EvalCase", "by_type", "quick_subset"]


if __name__ == "__main__":
    print(f"{len(TEST_SET)} evaluation cases\n")
    for case in TEST_SET:
        print(f"  {case.id:<10} {case.qtype:<9} {case.question}")
