"""F3 - Retriever agent (RAG over the document corpus).

Done when: called on its own, it returns the chunks that actually answer a
document question. `python -m app.agents.retriever "why did customers churn?"`
is that demonstration.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from ..config import settings
from ..state import AgentState
from ..vectorstore import get_vectorstore

logger = logging.getLogger(__name__)


def retriever_agent(state: AgentState) -> Dict[str, Any]:
    """Top-k similarity search over Qdrant; appends evidence to ``documents``."""
    question = state["question"]
    k = settings.retriever_top_k

    try:
        retriever = get_vectorstore().as_retriever(search_kwargs={"k": k})
        docs = retriever.invoke(question)
    except Exception as exc:  # never let one agent take the whole graph down
        logger.warning("Retriever failed: %s", exc)
        return {
            "steps": state.get("steps", []) + [f"retriever:error({type(exc).__name__})"],
            "documents": state.get("documents", []),
        }

    texts = [d.page_content for d in docs]
    sources = [
        {
            "type": "document",
            "title": d.metadata.get("title") or d.metadata.get("source", "document"),
            "source": d.metadata.get("source", "unknown"),
            "snippet": " ".join(d.page_content.split())[:240],
        }
        for d in docs
    ]

    return {
        "documents": state.get("documents", []) + texts,
        "sources": state.get("sources", []) + sources,
        "steps": state.get("steps", []) + [f"retriever(k={k},hits={len(texts)})"],
    }


if __name__ == "__main__":  # standalone test: python -m app.agents.retriever "..."
    import sys

    from ..state import new_state

    q = " ".join(sys.argv[1:]) or "Why did customers churn in Q2 2026?"
    out = retriever_agent(new_state(q))
    print(f"Question: {q}")
    print(f"Steps: {out['steps']}")
    for i, doc in enumerate(out["documents"], 1):
        print(f"\n[{i}] {' '.join(doc.split())[:400]}...")
