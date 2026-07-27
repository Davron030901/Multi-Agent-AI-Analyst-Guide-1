"""F6 - Code agent (sandboxed Python execution).

LLMs are unreliable at exact arithmetic. This agent makes the model *write* the
calculation and then runs it, so the number comes from Python, not from token
prediction.

Execution goes through ``app.sandbox`` - static AST allow-list, isolated
subprocess with scrubbed env, hard timeout and rlimits. See that module for the
threat model. If the sandbox rejects the code, the agent gets one retry with the
rejection reason fed back.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from ..config import settings
from ..llm import get_llm
from ..sandbox import run_code, strip_code_fences
from ..state import AgentState

logger = logging.getLogger(__name__)

MAX_CODE_ATTEMPTS = 2

CODE_PROMPT = """You write short, self-contained Python snippets that compute an exact answer.

## Question
{question}

## Evidence already gathered (use these numbers - do not invent data)
{evidence}

## Hard rules
- Output ONLY Python code. No prose, no markdown fences, no explanation.
- The snippet must `print()` the final answer, clearly labelled.
- It runs in a sandbox with NO file access, NO network, and NO os/sys/subprocess.
  Allowed imports: math, statistics, decimal, fractions, datetime, json, re,
  itertools, functools, collections, random, numpy, pandas.
- Hardcode any numbers you were given above as literals. You cannot query a
  database or read a file from here.
- Keep it under 40 lines and make it terminate immediately - there is a
  {timeout}-second wall-clock limit.
- Round money to 2 decimals and percentages to 1 decimal.
"""

RETRY_SUFFIX = """
Your previous snippet did not work.

Snippet:
{bad_code}

Problem: {reason}

Write a corrected snippet. Python only.
"""


def _evidence_for_code(state: AgentState) -> str:
    """Only the parts of state a calculation could need, trimmed for the prompt."""
    parts = []
    if state.get("sql_result"):
        parts.append(f"SQL result:\n{state['sql_result']}")
    docs = state.get("documents") or []
    if docs:
        joined = "\n".join(" ".join(d.split())[:600] for d in docs[:4])
        parts.append(f"Document extracts:\n{joined}")
    return "\n\n".join(parts) if parts else "(none - derive everything from the question itself)"


def write_python(question: str, evidence: str, feedback: Optional[tuple] = None) -> str:
    prompt = CODE_PROMPT.format(
        question=question,
        evidence=evidence,
        timeout=settings.code_timeout_seconds,
    )
    if feedback:
        prompt += RETRY_SUFFIX.format(bad_code=feedback[0], reason=feedback[1])

    raw = get_llm().invoke(prompt).content
    return strip_code_fences(raw if isinstance(raw, str) else str(raw))


def code_agent(state: AgentState) -> Dict[str, Any]:
    """Write Python for the question, run it sandboxed, store stdout."""
    question = state["question"]
    steps = state.get("steps", [])
    evidence = _evidence_for_code(state)

    feedback = None
    last_reason = ""

    for attempt in range(1, MAX_CODE_ATTEMPTS + 1):
        try:
            code = write_python(question, evidence, feedback)
        except Exception as exc:
            logger.warning("Code generation failed: %s", exc)
            return {
                "code_result": f"CODE GENERATION FAILED: {exc}",
                "steps": steps + [f"code:llm-error(attempt {attempt})"],
            }

        result = run_code(code)

        if result.ok:
            return {
                "code_result": f"{code}\n-> {result.render()}",
                "sources": state.get("sources", [])
                + [{"type": "code", "title": "sandboxed Python", "snippet": code[:600]}],
                "steps": steps + [f"code:ok(attempt {attempt})"],
            }

        last_reason = result.render()
        logger.warning("Sandbox run failed (attempt %d): %s", attempt, last_reason[:300])
        feedback = (code, last_reason)

    return {
        "code_result": f"CODE AGENT FAILED after {MAX_CODE_ATTEMPTS} attempts.\n{last_reason}",
        "steps": steps + [f"code:failed({MAX_CODE_ATTEMPTS} attempts)"],
    }


if __name__ == "__main__":  # python -m app.agents.code "what is the compound growth of ..."
    import sys

    from ..state import new_state

    q = " ".join(sys.argv[1:]) or (
        "If MRR is 865239 dollars and we lose 7362 dollars, what percentage did we lose?"
    )
    out = code_agent(new_state(q))
    print(f"Question: {q}\nSteps: {out['steps']}\n\n{out['code_result']}")
