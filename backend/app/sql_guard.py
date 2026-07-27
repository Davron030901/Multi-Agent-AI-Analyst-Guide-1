"""F5 - Read-only SQL guard.

Constraint #3: the data agent must reject anything that is not a ``SELECT``.
Two layers, because either alone is bypassable:

1. **This static guard** - one statement only, must start with SELECT/WITH, no
   DML/DDL keyword anywhere, no multi-statement injection, no comment tricks.
2. **A read-only connection** - ``settings.db_uri`` opens SQLite with
   ``mode=ro``, so even a guard bypass hits ``attempt to write a readonly
   database`` at the driver level.
"""

from __future__ import annotations

import re
from typing import List

FORBIDDEN_KEYWORDS: List[str] = [
    "insert", "update", "delete", "drop", "alter", "create", "replace",
    "truncate", "attach", "detach", "pragma", "vacuum", "reindex",
    "grant", "revoke", "commit", "rollback", "begin", "savepoint",
    "analyze", "upsert", "merge",
]


class UnsafeSQLError(ValueError):
    """Raised when a generated query is not a safe read-only SELECT."""


_LINE_COMMENT = re.compile(r"--[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_FENCE = re.compile(r"```(?:sql)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def extract_sql(raw: str) -> str:
    """Pull a bare SQL string out of whatever the LLM returned."""
    text = raw.strip()

    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1)

    # Models sometimes prefix "SQL:" or "Query:" despite instructions.
    text = re.sub(r"^\s*(sql|query|answer)\s*:\s*", "", text, flags=re.IGNORECASE)
    return text.strip().rstrip(";").strip()


def _strip_comments(sql: str) -> str:
    return _BLOCK_COMMENT.sub(" ", _LINE_COMMENT.sub(" ", sql))


def assert_read_only(sql: str) -> str:
    """Validate ``sql`` and return the cleaned query, or raise UnsafeSQLError."""
    if not sql or not sql.strip():
        raise UnsafeSQLError("Empty query.")

    cleaned = _strip_comments(sql).strip().rstrip(";").strip()
    if not cleaned:
        raise UnsafeSQLError("Query is only comments.")

    # Reject stacked statements: "SELECT 1; DROP TABLE customers"
    statements = [s for s in cleaned.split(";") if s.strip()]
    if len(statements) > 1:
        raise UnsafeSQLError(
            f"Only a single statement is allowed; got {len(statements)}. "
            "Multi-statement queries are rejected outright."
        )

    lowered = cleaned.lower()

    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise UnsafeSQLError(
            f"Query must start with SELECT (or a WITH ... SELECT CTE). Got: {cleaned[:80]!r}"
        )

    # Keyword scan on word boundaries so 'created_date' does not trip 'create'.
    for keyword in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{keyword}\b", lowered):
            raise UnsafeSQLError(
                f"Forbidden keyword '{keyword.upper()}' found. This agent is strictly read-only."
            )

    # A WITH block must ultimately SELECT, never end in DML.
    if lowered.startswith("with") and not re.search(r"\bselect\b", lowered):
        raise UnsafeSQLError("A WITH clause must contain a SELECT.")

    return cleaned


def is_read_only(sql: str) -> bool:
    """Non-raising convenience wrapper."""
    try:
        assert_read_only(sql)
        return True
    except UnsafeSQLError:
        return False


__all__ = ["assert_read_only", "is_read_only", "extract_sql", "UnsafeSQLError", "FORBIDDEN_KEYWORDS"]
