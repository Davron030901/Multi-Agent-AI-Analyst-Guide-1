"""F1 - Shared state.

A single ``AgentState`` object flows through EVERY node in the graph. Each node
reads what it needs and returns a partial dict that LangGraph merges back in.
No shared state => no collaboration, so this module is deliberately tiny and is
imported by every agent.
"""

from __future__ import annotations

from typing import List, Optional, TypedDict


class AgentState(TypedDict, total=False):
    """State passed between all nodes of the supervisor graph.

    Attributes
    ----------
    question:
        The user's current question. Set once at invocation.
    plan:
        The supervisor's routing decision for the next hop:
        ``retriever`` | ``web`` | ``data`` | ``code`` | ``finish``.
    documents:
        Text evidence gathered by the retriever and/or web agents.
    sql_result:
        ``"<sql query>\\n-> <rows>"`` produced by the data agent (F5).
    code_result:
        stdout captured from the sandboxed code agent (F6).
    answer:
        The drafted / final answer. Written by the generate node, rewritten on
        each revision loop.
    steps:
        Ordered trace of every node that ran, e.g.
        ``["supervisor->data", "data(sql)", "supervisor->finish", "critic:ok"]``.
        This is what the frontend streams and what the supervisor reads to know
        what it has already tried.
    revisions:
        How many times the critic has rejected the answer. Combined with
        ``MAX_REVISIONS`` this is what guarantees the graph terminates.
    critic_reason:
        The critic's justification for its most recent verdict.
    supervisor_reason:
        The supervisor's justification for its most recent routing decision.
        Surfaced in the UI trace so a mis-route is visible, not mysterious.
    memory:
        Relevant past Q/A turns retrieved from long-term memory (F10).
    sources:
        Citations surfaced to the UI (title/url/snippet dicts).
    """

    question: str
    plan: str
    documents: List[str]
    sql_result: Optional[str]
    code_result: Optional[str]
    answer: str
    steps: List[str]
    revisions: int
    critic_reason: Optional[str]
    supervisor_reason: Optional[str]
    memory: List[str]
    sources: List[dict]


def new_state(question: str, memory: Optional[List[str]] = None) -> AgentState:
    """Build a fully-initialised state so no node ever has to guard for None."""
    return AgentState(
        question=question,
        plan="",
        documents=[],
        sql_result=None,
        code_result=None,
        answer="",
        steps=[],
        revisions=0,
        critic_reason=None,
        supervisor_reason=None,
        memory=memory or [],
        sources=[],
    )


def evidence_summary(state: AgentState) -> str:
    """Render every piece of collected evidence as one string.

    Used by the generate node and the critic so both judge the *same* material.
    """
    parts: List[str] = []

    if state.get("memory"):
        parts.append("## Relevant past conversation\n" + "\n".join(state["memory"]))

    docs = state.get("documents") or []
    if docs:
        rendered = "\n\n".join(f"[doc {i + 1}] {d}" for i, d in enumerate(docs))
        parts.append("## Retrieved documents / web results\n" + rendered)

    if state.get("sql_result"):
        parts.append("## Database query result (authoritative for numbers)\n" + state["sql_result"])

    if state.get("code_result"):
        parts.append("## Code execution output (authoritative for math)\n" + state["code_result"])

    return "\n\n".join(parts) if parts else "(no evidence collected)"
