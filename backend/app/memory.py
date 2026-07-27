"""F10 - Long-term memory.

A second Qdrant collection holding ``Q: ... / A: ...`` pairs from past turns. On
each new question we retrieve the most similar past turns and hand them to the
supervisor, which is what makes an elliptical follow-up like "and the previous
year?" resolve correctly.

Everything here fails soft: if the vector store is unreachable, memory silently
returns nothing rather than taking the run down with it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from langchain_core.documents import Document

from .config import settings

logger = logging.getLogger(__name__)

MAX_STORED_CHARS = 2000


def _store():
    from .vectorstore import get_vectorstore

    return get_vectorstore(settings.qdrant_memory_collection)


def remember(question: str, answer: str, session_id: Optional[str] = None) -> bool:
    """Persist one completed turn. Returns True on success."""
    if not question or not answer:
        return False

    text = f"Q: {question.strip()}\nA: {answer.strip()}"[:MAX_STORED_CHARS]
    doc = Document(
        page_content=text,
        metadata={
            "kind": "turn",
            "question": question.strip()[:500],
            "session_id": session_id or "default",
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    )

    try:
        _store().add_documents([doc])
        return True
    except Exception as exc:
        logger.warning("Could not write to long-term memory: %s", exc)
        return False


def recall(question: str, k: Optional[int] = None) -> List[str]:
    """Return the most relevant past turns as plain strings."""
    top_k = k or settings.memory_top_k
    try:
        hits = _store().similarity_search(question, k=top_k)
    except Exception as exc:
        logger.info("Long-term memory unavailable (%s) - continuing without it.", exc)
        return []

    return [h.page_content for h in hits]


def clear() -> None:
    """Wipe long-term memory (used by tests and the eval harness)."""
    from .vectorstore import reset_collection

    try:
        reset_collection(settings.qdrant_memory_collection)
    except Exception as exc:
        logger.warning("Could not clear memory: %s", exc)


def size() -> int:
    from .vectorstore import count

    try:
        return count(settings.qdrant_memory_collection)
    except Exception:
        return 0


__all__ = ["remember", "recall", "clear", "size"]


if __name__ == "__main__":  # quick manual check of the follow-up behaviour
    print(f"memory holds {size()} turn(s)")
    remember(
        "How many customers churned in Q2 2026?",
        "12 customers churned in Q2 2026, representing $7,362 of lost MRR.",
    )
    for i, turn in enumerate(recall("and the previous quarter?"), 1):
        print(f"\n[{i}] {turn}")
