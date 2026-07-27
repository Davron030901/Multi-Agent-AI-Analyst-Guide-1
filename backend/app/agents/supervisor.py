"""F7 - Supervisor / Router.

The brain of the system. An LLM with **structured output** reads the question
plus everything gathered so far and names the next node, or ``finish``.

Two things make this reliable rather than a coin flip:

* **Structured output** - the decision is a parsed enum, not free text we regex.
* **Deterministic rails around the LLM** - a step budget forces ``finish``, and
  an agent is never dispatched twice for the same purpose. The LLM decides
  *which*; the code guarantees *termination*.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

from ..config import settings
from ..llm import structured
from ..state import AgentState

logger = logging.getLogger(__name__)

NextAgent = Literal["retriever", "web", "data", "code", "finish"]
SPECIALISTS = ("retriever", "web", "data", "code")


class Route(BaseModel):
    """The supervisor's decision for the next hop."""

    next: NextAgent = Field(
        description=(
            "Which specialist runs next. "
            "'retriever' = internal company documents (policies, postmortems, roadmap, playbooks). "
            "'web' = public/external information not in our documents. "
            "'data' = counts, sums, averages, rankings - anything that needs the SQL database. "
            "'code' = exact arithmetic on numbers we ALREADY have. "
            "'finish' = enough evidence has been gathered to answer."
        )
    )
    reason: str = Field(description="One short sentence justifying the choice.")


SUPERVISOR_PROMPT = """You are the supervisor of a team of specialist agents for Northwind Cloud, a B2B SaaS company. Route the question to the right specialist, one hop at a time.

## Your team
- **retriever** - RAG over INTERNAL company documents: the Q2 2026 churn postmortem
  (reason codes and why customers left), pricing & packaging, the support SLA policy,
  the H2 2026 product roadmap, the customer success playbook, security & compliance.
  Use this for any "why", "what is our policy", "what are we shipping" question.
- **web** - live public web search. Use ONLY for information that could not be in our
  internal documents or database (competitors, general knowledge, current events).
- **data** - text-to-SQL over the production database: customers, plans, subscriptions,
  invoices, churn_events, support_tickets. Use for ANY number: how many, total, average,
  breakdown, ranking, per-segment, per-quarter.
- **code** - runs Python in a sandbox. Use ONLY for arithmetic on numbers that have
  ALREADY been gathered (percentages, growth rates, ratios, projections). Never use it
  to fetch data.
- **finish** - you have everything needed; hand off to answer generation.

## Current question
{question}

## Evidence gathered so far
{gathered}

## Steps already taken
{steps}
{revision_note}
## Rules
1. Dispatch ONE agent at a time. You will be called again after it returns.
2. Never dispatch the same agent twice unless the previous run failed or the
   critic asked for something specific that is still missing.
3. A "how many ... and why" question needs BOTH data and retriever. Get the
   number first, then the explanation.
4. Only choose 'code' when the numbers it needs are already in the evidence.
5. Choose 'finish' as soon as the evidence answers the question. Do not gather
   evidence you will not use.
"""

REVISION_NOTE = """
## The critic REJECTED the previous answer
Reason: {reason}

Dispatch whichever agent closes that specific gap. If the evidence is already
sufficient and the answer merely needs rewriting, choose 'finish'.
"""


def _gathered_summary(state: AgentState) -> str:
    lines: List[str] = []
    docs = state.get("documents") or []
    if docs:
        lines.append(f"- documents: {len(docs)} chunk(s) retrieved")
        lines.append(f"  first chunk preview: {' '.join(docs[0].split())[:200]}...")
    if state.get("sql_result"):
        lines.append(f"- sql_result: {' '.join(str(state['sql_result']).split())[:300]}")
    if state.get("code_result"):
        lines.append(f"- code_result: {' '.join(str(state['code_result']).split())[:300]}")
    if state.get("memory"):
        lines.append(f"- memory: {len(state['memory'])} relevant past turn(s)")
    return "\n".join(lines) if lines else "(nothing gathered yet)"


def _agents_used(steps: List[str]) -> set:
    """Which specialists have already run.

    Specialist steps look like ``"data(sql):ok(attempt 1)"`` or
    ``"retriever(k=4,hits=4)"``; supervisor steps look like ``"supervisor->data"``
    and must NOT count, which is why we match on the step prefix.
    """
    return {agent for step in steps for agent in SPECIALISTS if step.startswith(agent)}


def heuristic_route(state: AgentState) -> str:
    """Deterministic fallback if structured output is unavailable or fails.

    Keeps the system usable (and testable) without a live LLM call.
    """
    question = state["question"].lower()
    used = _agents_used(state.get("steps", []))

    numeric = re.search(
        r"\b(how many|how much|count|total|sum|average|avg|median|number of|"
        r"breakdown|per |by segment|by quarter|top \d|rank|most|least|percentage|percent|rate)\b",
        question,
    )
    explanatory = re.search(
        r"\b(why|reason|explain|policy|what is our|roadmap|sla|playbook|process|plan|guidance)\b",
        question,
    )
    external = re.search(r"\b(competitor|market|news|industry trend|latest|who is|public)\b", question)
    arithmetic = re.search(r"\b(percentage|percent|ratio|growth|projection|annualis|annualiz|per month|per year)\b", question)

    if numeric and "data" not in used:
        return "data"
    if explanatory and "retriever" not in used:
        return "retriever"
    if external and "web" not in used:
        return "web"
    if arithmetic and "code" not in used and (state.get("sql_result") or state.get("documents")):
        return "code"
    if not used:
        return "retriever"
    return "finish"


def supervisor(state: AgentState) -> Dict[str, Any]:
    """Decide the next node and record it in ``plan``."""
    steps = state.get("steps", [])

    # ---- deterministic rail 1: step budget -------------------------------
    # Reserve headroom so generate + critic can still run inside the recursion limit.
    if len(steps) >= settings.recursion_limit - 6:
        logger.info("Step budget reached (%d steps) - forcing finish.", len(steps))
        return {"plan": "finish", "steps": steps + ["supervisor->finish(step budget)"]}

    revision_note = ""
    if state.get("revisions", 0) > 0 and state.get("critic_reason"):
        revision_note = REVISION_NOTE.format(reason=state["critic_reason"])

    prompt = SUPERVISOR_PROMPT.format(
        question=state["question"],
        gathered=_gathered_summary(state),
        steps=", ".join(steps) if steps else "(none)",
        revision_note=revision_note,
    )

    try:
        decision: Route = structured(Route).invoke(prompt)  # type: ignore[assignment]
        nxt, reason = decision.next, decision.reason
    except Exception as exc:
        nxt = heuristic_route(state)
        reason = f"structured routing failed ({type(exc).__name__}); heuristic fallback"
        logger.warning("Supervisor fell back to heuristic routing: %s", exc)

    # ---- deterministic rail 2: no infinite re-dispatch of one agent -------
    used = _agents_used(steps)
    if nxt in SPECIALISTS and nxt in used and state.get("revisions", 0) == 0:
        logger.info("Supervisor tried to re-run '%s' with no revision pending - finishing.", nxt)
        nxt, reason = "finish", f"{nxt} already ran; evidence is in state"

    return {
        "plan": nxt,
        "steps": steps + [f"supervisor->{nxt}"],
        "supervisor_reason": reason,
    }


def route_from_supervisor(state: AgentState) -> str:
    """Conditional-edge function: map ``plan`` onto a node name."""
    plan = (state.get("plan") or "").strip()
    return plan if plan in (*SPECIALISTS, "finish") else "finish"


__all__ = ["supervisor", "route_from_supervisor", "heuristic_route", "Route", "SPECIALISTS"]
