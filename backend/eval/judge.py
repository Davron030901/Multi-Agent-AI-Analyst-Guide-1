"""F11 - LLM-as-judge scorer.

Scores each answer 1-5 against the reference answer on a fixed rubric. Runs at
temperature 0 with structured output so the score is a parsed integer, not text
we have to salvage with a regex.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.llm import structured  # noqa: E402

logger = logging.getLogger(__name__)


class JudgeScore(BaseModel):
    score: int = Field(ge=1, le=5, description="1-5 against the rubric below.")
    reason: str = Field(description="One sentence explaining the score.")
    factual_errors: str = Field(
        default="",
        description="Any specific number or claim that is wrong. Empty string if none.",
    )


JUDGE_PROMPT = """You are grading an AI analyst's answer against a reference answer. Be strict and consistent.

## Question
{question}

## Reference answer (ground truth)
{reference}

## Answer under evaluation
{answer}

## Rubric
5 - Fully correct and complete. Every figure matches the reference. Nothing invented.
4 - Correct on all key facts, but thin: a secondary detail is missing or vague.
3 - Partially correct. The main claim holds but something is missing or imprecise.
2 - Substantially wrong: a key number or causal claim contradicts the reference.
1 - Wrong, fabricated, or does not answer the question at all.

## Grading rules
- Numbers are the priority. A wrong figure caps the score at 2, even if the prose is good.
- Wording need not match; meaning must. Do not penalise a different phrasing or ordering.
- Extra correct detail beyond the reference is fine and must not be penalised.
- An honest "the evidence does not cover this" scores 3 - better than a confident
  fabrication (1), worse than a correct answer.
"""


def judge_answer(question: str, answer: str, reference: str) -> JudgeScore:
    """Score one answer. Never raises - a failed judge returns a neutral 3."""
    prompt = JUDGE_PROMPT.format(question=question, reference=reference, answer=answer or "(no answer)")
    try:
        return structured(JudgeScore, temperature=0.0).invoke(prompt)  # type: ignore[return-value]
    except Exception as exc:
        logger.warning("Judge call failed for %r: %s", question[:60], exc)
        return JudgeScore(score=3, reason=f"judge unavailable ({type(exc).__name__})", factual_errors="")


def contains_check(answer: str, must_contain: list[str]) -> Optional[bool]:
    """Deterministic exact-fact check.

    ``must_contain`` is treated as OR-of-variants where entries are alternative
    spellings of the same figure (``"7362"`` / ``"7,362"``), so we normalise and
    require every *distinct* fact to appear in some form.

    Returns None when the case declares no facts to check.
    """
    if not must_contain:
        return None

    normalised = answer.replace(",", "").replace("$", "").lower()
    # Group variants: strip separators so "7,362" and "7362" collapse to one key.
    groups: dict[str, list[str]] = {}
    for token in must_contain:
        key = token.replace(",", "").replace("$", "").lower()
        groups.setdefault(key, []).append(token)

    return all(key in normalised for key in groups)


__all__ = ["judge_answer", "JudgeScore", "contains_check"]
