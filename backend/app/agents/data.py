"""F5 - Data agent (text-to-SQL).

The agent reads the live schema, writes one SQLite query, **proves it is
read-only before executing it**, runs it against a read-only connection, and
stores ``"<sql>\\n-> <rows>"`` in ``state['sql_result']``.

If the guard rejects the query the agent gets exactly one retry, with the
rejection reason fed back to it. It never silently executes anything.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, Optional, Tuple

from ..config import settings
from ..llm import get_llm
from ..sql_guard import UnsafeSQLError, assert_read_only, extract_sql
from ..state import AgentState

logger = logging.getLogger(__name__)

MAX_RESULT_CHARS = 4000
MAX_SQL_ATTEMPTS = 2

SQL_PROMPT = """You are a precise SQLite analyst for a B2B SaaS company called Northwind Cloud.

Write exactly ONE SQLite SELECT query that answers the question.

## Schema
{schema}

## Domain rules
- MRR = monthly recurring revenue in USD. `subscriptions.mrr` = plan price x seats.
- A customer has churned when `subscriptions.status = 'churned'`; the matching
  row in `churn_events` carries the date, the reason code and the MRR lost.
- The dataset ends on 2026-06-30, so "last quarter" = Q2 2026
  (`churn_date BETWEEN '2026-04-01' AND '2026-06-30'`).
  Q1 2026 = 2026-01-01..2026-03-31. Q4 2025 = 2025-10-01..2025-12-31.
- Dates are stored as ISO text ('YYYY-MM-DD'), so plain string comparison works.
- Reason codes: MISSING_FEATURE, PRICE, POOR_SUPPORT, BUDGET_CUT,
  ONBOARDING_FAILURE, MIGRATED_INHOUSE, MERGER.
- Segments: SMB, Mid-Market, Enterprise. Priorities: P1, P2, P3.

## Hard rules
- Output ONLY the SQL. No prose, no explanation, no markdown fences.
- SELECT (or WITH ... SELECT) only. Never INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/PRAGMA.
- A single statement. No semicolon-separated statements.
- Round money to 2 decimals and give aggregate columns readable aliases.
- If the question asks for a breakdown, GROUP BY and ORDER BY the count descending.

## Question
{question}
"""

RETRY_SUFFIX = """
Your previous attempt was REJECTED by the read-only guard.

Rejected query:
{bad_sql}

Reason: {reason}

Write a corrected single read-only SELECT query. SQL only.
"""


@lru_cache(maxsize=1)
def get_db():
    """Read-only SQLDatabase handle (layer 2 of the write protection)."""
    from langchain_community.utilities import SQLDatabase

    if not settings.db_path.exists():
        raise FileNotFoundError(
            f"Database not found at {settings.db_path}.\n"
            "Seed it first:  cd backend && python -m ingestion.seed_db"
        )

    return SQLDatabase.from_uri(
        settings.db_uri,
        sample_rows_in_table_info=2,
    )


def get_schema() -> str:
    return get_db().get_table_info()


def write_sql(question: str, schema: str, feedback: Optional[Tuple[str, str]] = None) -> str:
    """Ask the LLM for one query. ``feedback`` = (bad_sql, reason) on a retry."""
    prompt = SQL_PROMPT.format(schema=schema, question=question)
    if feedback:
        prompt += RETRY_SUFFIX.format(bad_sql=feedback[0], reason=feedback[1])

    raw = get_llm().invoke(prompt).content
    return extract_sql(raw if isinstance(raw, str) else str(raw))


def run_sql(sql: str) -> str:
    """Execute a query that has ALREADY passed ``assert_read_only``."""
    result = get_db().run(sql)
    text = str(result).strip()
    if len(text) > MAX_RESULT_CHARS:
        text = text[:MAX_RESULT_CHARS] + f"\n... (truncated at {MAX_RESULT_CHARS} chars)"
    return text or "(query returned no rows)"


def data_agent(state: AgentState) -> Dict[str, Any]:
    """Question -> guarded SQL -> result, stored in ``sql_result``."""
    question = state["question"]
    steps = state.get("steps", [])

    try:
        schema = get_schema()
    except Exception as exc:
        logger.warning("Data agent could not open the database: %s", exc)
        return {
            "sql_result": f"DATABASE UNAVAILABLE: {exc}",
            "steps": steps + ["data(sql):db-unavailable"],
        }

    feedback: Optional[Tuple[str, str]] = None
    last_error = ""

    for attempt in range(1, MAX_SQL_ATTEMPTS + 1):
        try:
            candidate = write_sql(question, schema, feedback)
        except Exception as exc:
            logger.warning("SQL generation failed: %s", exc)
            return {
                "sql_result": f"SQL GENERATION FAILED: {exc}",
                "steps": steps + [f"data(sql):llm-error(attempt {attempt})"],
            }

        # --- the guard. Nothing executes before this passes. ---------------
        try:
            safe_sql = assert_read_only(candidate)
        except UnsafeSQLError as exc:
            last_error = str(exc)
            logger.warning("Rejected unsafe SQL (attempt %d): %s", attempt, last_error)
            feedback = (candidate, last_error)
            continue

        try:
            rows = run_sql(safe_sql)
        except Exception as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            logger.warning("SQL execution failed (attempt %d): %s", attempt, last_error)
            feedback = (safe_sql, last_error)
            continue

        return {
            "sql_result": f"{safe_sql}\n-> {rows}",
            "sources": state.get("sources", [])
            + [{"type": "sql", "title": "company.db (read-only)", "snippet": safe_sql}],
            "steps": steps + [f"data(sql):ok(attempt {attempt})"],
        }

    return {
        "sql_result": f"SQL AGENT FAILED after {MAX_SQL_ATTEMPTS} attempts. Last error: {last_error}",
        "steps": steps + [f"data(sql):failed({MAX_SQL_ATTEMPTS} attempts)"],
    }


if __name__ == "__main__":  # python -m app.agents.data "how many customers churned last quarter?"
    import sys

    from ..state import new_state

    q = " ".join(sys.argv[1:]) or "How many customers churned last quarter?"
    out = data_agent(new_state(q))
    print(f"Question: {q}\nSteps: {out['steps']}\n\n{out['sql_result']}")
