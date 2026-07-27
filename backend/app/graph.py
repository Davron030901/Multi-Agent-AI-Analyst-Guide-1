"""F9 - Graph wiring.

This is what turns seven functions into a system:

    START -> supervisor -+-> retriever -+
                         +-> web -------+--> back to supervisor
                         +-> data ------+
                         +-> code ------+
                         `-> (finish) ----> generate -> critic -+-> END
                                                                `-> supervisor (revise)

Termination is guaranteed by three independent mechanisms, any one of which is
sufficient:

1. ``recursion_limit`` on the compiled graph (LangGraph raises if exceeded).
2. The supervisor's step budget, which forces ``finish``.
3. ``route_after_critic``, which has no path back to the supervisor once
   ``revisions > MAX_REVISIONS``.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, AsyncIterator, Dict, List, Optional

from langgraph.graph import END, START, StateGraph

from .agents.code import code_agent
from .agents.critic import critic, route_after_critic
from .agents.data import data_agent
from .agents.generate import generate
from .agents.retriever import retriever_agent
from .agents.supervisor import route_from_supervisor, supervisor
from .agents.web import web_agent
from .config import settings
from .state import AgentState, new_state

logger = logging.getLogger(__name__)

SPECIALIST_NODES = {
    "retriever": retriever_agent,
    "web": web_agent,
    "data": data_agent,
    "code": code_agent,
}


def build_graph(enable_critic: bool = True):
    """Compile the supervisor graph.

    ``enable_critic=False`` skips the verification gate - used by the evaluation
    harness to produce the with-critic / without-critic comparison (F11).
    """
    graph = StateGraph(AgentState)

    graph.add_node("supervisor", supervisor)
    for name, fn in SPECIALIST_NODES.items():
        graph.add_node(name, fn)
    graph.add_node("generate", generate)

    graph.add_edge(START, "supervisor")

    # supervisor -> specialist | generate
    graph.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "retriever": "retriever",
            "web": "web",
            "data": "data",
            "code": "code",
            "finish": "generate",
        },
    )

    # every specialist hands control straight back to the supervisor
    for name in SPECIALIST_NODES:
        graph.add_edge(name, "supervisor")

    if enable_critic:
        graph.add_node("critic", critic)
        graph.add_edge("generate", "critic")
        graph.add_conditional_edges(
            "critic",
            route_after_critic,
            {"finish": END, "revise": "supervisor"},
        )
    else:
        graph.add_edge("generate", END)

    return graph.compile()


@lru_cache(maxsize=2)
def get_app(enable_critic: bool = True):
    """Cached compiled graph (compiling is cheap but not free)."""
    return build_graph(enable_critic)


def run_config(callbacks: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Runtime config: the recursion limit plus any tracing callbacks."""
    cfg: Dict[str, Any] = {"recursion_limit": settings.recursion_limit}
    if callbacks:
        cfg["callbacks"] = callbacks
    return cfg


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def ask(
    question: str,
    *,
    enable_critic: bool = True,
    use_memory: bool = True,
    trace: bool = True,
    session_id: Optional[str] = None,
) -> AgentState:
    """Answer one question end-to-end. Synchronous.

    Wires in long-term memory (F10) and Langfuse tracing (F12) when available.
    """
    from .memory import recall, remember
    from .observability import get_callbacks

    past = recall(question) if use_memory else []
    state = new_state(question, memory=past)

    callbacks = get_callbacks(session_id=session_id) if trace else []

    try:
        result = get_app(enable_critic).invoke(state, config=run_config(callbacks))
    except Exception as exc:
        # A recursion-limit breach lands here. Return a usable state, not a stack trace.
        logger.error("Graph run failed: %s", exc)
        state["answer"] = f"The run did not complete: {type(exc).__name__}: {exc}"
        state["steps"] = state.get("steps", []) + [f"graph:error({type(exc).__name__})"]
        return state

    if use_memory and result.get("answer"):
        remember(question, result["answer"])

    return result  # type: ignore[return-value]


async def astream_events(
    question: str,
    *,
    enable_critic: bool = True,
    use_memory: bool = True,
    session_id: Optional[str] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """Yield one event per completed node - this is what the frontend renders.

    Event shape::

        {"type": "step",  "node": "data", "steps": [...], "detail": "..."}
        {"type": "final", "answer": "...", "steps": [...], "sources": [...]}
        {"type": "error", "message": "..."}
    """
    from .memory import recall, remember
    from .observability import get_callbacks

    past = recall(question) if use_memory else []
    state = new_state(question, memory=past)
    callbacks = get_callbacks(session_id=session_id)

    final: Dict[str, Any] = {}

    try:
        async for chunk in get_app(enable_critic).astream(
            state, config=run_config(callbacks), stream_mode="updates"
        ):
            for node, update in chunk.items():
                if not isinstance(update, dict):
                    continue
                final.update(update)
                yield {
                    "type": "step",
                    "node": node,
                    "steps": update.get("steps", final.get("steps", [])),
                    "detail": _detail_for(node, update),
                    "plan": update.get("plan"),
                }
    except Exception as exc:
        logger.error("Streaming run failed: %s", exc)
        yield {"type": "error", "message": f"{type(exc).__name__}: {exc}"}
        return

    answer = final.get("answer", "")
    if use_memory and answer:
        remember(question, answer)

    yield {
        "type": "final",
        "answer": answer,
        "steps": final.get("steps", []),
        "sources": final.get("sources", []),
        "revisions": final.get("revisions", 0),
        "sql_result": final.get("sql_result"),
        "code_result": final.get("code_result"),
    }


def _detail_for(node: str, update: Dict[str, Any]) -> str:
    """A one-line, human-readable summary of what a node just did."""
    if node == "supervisor":
        return f"routing to '{update.get('plan', '?')}' - {update.get('supervisor_reason', '')}".strip()
    if node == "retriever":
        return f"retrieved {len(update.get('documents', []))} chunk(s)"
    if node == "web":
        steps = update.get("steps", [])
        return steps[-1] if steps else "web search"
    if node == "data":
        sql = (update.get("sql_result") or "").split("\n")[0]
        return f"SQL: {sql[:160]}"
    if node == "code":
        return (update.get("code_result") or "")[:160]
    if node == "generate":
        return "drafted the answer"
    if node == "critic":
        steps = update.get("steps", [])
        return steps[-1] if steps else "verified"
    return ""


def mermaid_diagram(enable_critic: bool = True) -> str:
    """Render the graph as Mermaid - used for the README diagram."""
    try:
        return get_app(enable_critic).get_graph().draw_mermaid()
    except Exception as exc:  # pragma: no cover
        return f"%% could not render: {exc}"


__all__ = ["build_graph", "get_app", "ask", "astream_events", "mermaid_diagram", "run_config"]


if __name__ == "__main__":  # python -m app.graph "how many customers churned last quarter and why?"
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    q = " ".join(sys.argv[1:]) or "How many customers churned last quarter, and why?"

    out = ask(q, use_memory=False)
    print(f"\nQUESTION: {q}\n")
    print("TRACE:")
    for step in out.get("steps", []):
        print(f"  - {step}")
    print(f"\nREVISIONS: {out.get('revisions', 0)}")
    print(f"\nANSWER:\n{out.get('answer', '(none)')}")
