"""Answer generation node.

Runs when the supervisor says ``finish``. Drafts the answer strictly from the
evidence in state - and, on a revision loop, from the critic's specific
complaint about the previous draft.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from ..llm import get_llm
from ..state import AgentState, evidence_summary

logger = logging.getLogger(__name__)

GENERATE_PROMPT = """You are a careful analyst at Northwind Cloud. Answer the question using ONLY the evidence below.

## Question
{question}

## Evidence
{evidence}

## Rules
- Numbers come from the SQL result. Never restate a number the evidence does not contain.
- Explanations ("why") come from the documents. Do not speculate beyond them.
- Arithmetic comes from the code output when present.
- If the evidence does not support part of the question, say so plainly rather
  than guessing. A partial, honest answer beats a confident invented one.
- Be concise and direct: 2-6 sentences, or a short list when the question asks
  for a breakdown. No preamble, no "based on the evidence provided".
{revision_block}"""

REVISION_BLOCK = """
## IMPORTANT - this is revision {n}
Your previous answer was rejected by the critic.

Previous answer:
{previous}

Critic's objection: {reason}

Fix exactly that. Do not repeat the same mistake.
"""


def generate(state: AgentState) -> Dict[str, Any]:
    """Draft (or re-draft) the answer from collected evidence."""
    revision_block = ""
    if state.get("revisions", 0) > 0 and state.get("critic_reason"):
        revision_block = REVISION_BLOCK.format(
            n=state["revisions"],
            previous=state.get("answer", "(none)"),
            reason=state["critic_reason"],
        )

    prompt = GENERATE_PROMPT.format(
        question=state["question"],
        evidence=evidence_summary(state),
        revision_block=revision_block,
    )

    try:
        answer = get_llm().invoke(prompt).content
        if not isinstance(answer, str):
            answer = str(answer)
    except Exception as exc:
        logger.error("Answer generation failed: %s", exc)
        answer = f"I could not generate an answer: {type(exc).__name__}: {exc}"

    tag = "generate" if state.get("revisions", 0) == 0 else f"generate(revision {state['revisions']})"
    return {
        "answer": answer.strip(),
        "steps": state.get("steps", []) + [tag],
    }


__all__ = ["generate"]
