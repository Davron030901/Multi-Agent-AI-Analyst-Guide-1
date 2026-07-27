"""F8 - Critic / Verifier.

The quality gate. It re-reads the drafted answer against the *same* evidence the
generator saw and decides whether every claim is (a) correct and (b) actually
supported. On rejection it increments ``revisions`` and the graph routes back to
the supervisor, which can gather what is missing.

Termination: the critic can only force ``MAX_REVISIONS`` loops. After that the
answer ships with the critic's caveat attached rather than looping forever.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field

from ..config import settings
from ..llm import structured
from ..state import AgentState, evidence_summary

logger = logging.getLogger(__name__)


class Verdict(BaseModel):
    """The critic's structured judgement."""

    ok: bool = Field(
        description=(
            "True only if EVERY claim in the answer is both correct and directly "
            "supported by the evidence. False if anything is unsupported, "
            "contradicted, miscalculated, or if the question is left unanswered."
        )
    )
    reason: str = Field(
        description=(
            "One or two sentences. If ok=false, name the specific unsupported or "
            "wrong claim and what evidence is missing - be actionable, not vague."
        )
    )


CRITIC_PROMPT = """You are a strict verifier. You do NOT rewrite the answer - you judge it.

## Question
{question}

## Evidence available to the answerer
{evidence}

## Drafted answer
{answer}

## Check, in order
1. **Grounding** - is every factual claim traceable to the evidence above?
   A number that does not appear in the SQL result or code output is a failure.
2. **Correctness** - do the numbers match the evidence exactly? Is any arithmetic
   or unit (dollars vs count, quarter vs year) wrong?
3. **Completeness** - does it actually answer what was asked? A "how many and why"
   question needs both the count and the reasons.
4. **No fabrication** - no invented causes, policies, dates or company facts.

Be strict but fair. Correct hedging like "the evidence does not cover X" is fine
and should PASS - honest incompleteness is not a failure. Fabricated confidence is.

Set ok=false only if there is a concrete, nameable problem.
"""


def heuristic_verdict(state: AgentState) -> Verdict:
    """Deterministic fallback so the gate still functions without a live LLM."""
    answer = (state.get("answer") or "").strip()
    has_evidence = bool(
        state.get("documents") or state.get("sql_result") or state.get("code_result")
    )

    if not answer:
        return Verdict(ok=False, reason="No answer was produced.")
    if answer.lower().startswith("i could not generate"):
        return Verdict(ok=False, reason="Answer generation errored.")
    if not has_evidence:
        return Verdict(ok=False, reason="No evidence was gathered, so nothing is grounded.")
    return Verdict(ok=True, reason="Heuristic check passed (LLM verification unavailable).")


def critic(state: AgentState) -> Dict[str, Any]:
    """Verify the drafted answer; increment ``revisions`` on rejection."""
    steps = state.get("steps", [])
    revisions = state.get("revisions", 0)

    prompt = CRITIC_PROMPT.format(
        question=state["question"],
        evidence=evidence_summary(state),
        answer=state.get("answer", "(no answer drafted)"),
    )

    try:
        verdict: Verdict = structured(Verdict).invoke(prompt)  # type: ignore[assignment]
    except Exception as exc:
        logger.warning("Critic LLM call failed (%s); using heuristic verdict.", exc)
        verdict = heuristic_verdict(state)

    if verdict.ok:
        return {
            "revisions": revisions,
            "critic_reason": verdict.reason,
            "steps": steps + ["critic:approved"],
        }

    new_revisions = revisions + 1
    exhausted = new_revisions > settings.max_revisions

    if exhausted:
        # Ship it, but never silently: the caveat travels with the answer.
        caveat = (
            f"\n\n_Note: this answer was flagged by the verifier and could not be fully "
            f"resolved after {settings.max_revisions} revision(s). Verifier's concern: "
            f"{verdict.reason}_"
        )
        return {
            "revisions": new_revisions,
            "critic_reason": verdict.reason,
            "answer": (state.get("answer", "") + caveat).strip(),
            "steps": steps + [f"critic:rejected(revision budget exhausted) - {verdict.reason[:120]}"],
        }

    return {
        "revisions": new_revisions,
        "critic_reason": verdict.reason,
        "steps": steps + [f"critic:rejected({new_revisions}/{settings.max_revisions}) - {verdict.reason[:120]}"],
    }


def route_after_critic(state: AgentState) -> str:
    """Conditional edge: ``finish`` ends the run, ``revise`` loops to supervisor.

    This is the function that guarantees the graph terminates: once
    ``revisions > MAX_REVISIONS`` there is no path back to the supervisor.
    """
    steps = state.get("steps", [])
    approved = bool(steps) and steps[-1].startswith("critic:approved")
    if approved:
        return "finish"
    if state.get("revisions", 0) > settings.max_revisions:
        return "finish"
    return "revise"


__all__ = ["critic", "route_after_critic", "Verdict", "heuristic_verdict"]
