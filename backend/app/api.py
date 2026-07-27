"""F13/F14 - FastAPI backend with Server-Sent Events streaming.

Endpoints
---------
``GET  /health``            liveness + capability report
``GET  /graph``             the graph as Mermaid (used for the README diagram)
``POST /ask``               blocking: returns the final answer in one response
``POST /ask/stream``        SSE over fetch() - what the Next.js UI uses
``GET  /ask/stream?q=...``  SSE over EventSource - for curl and simple clients

Run locally::

    cd backend
    uvicorn app.api:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import __version__
from .config import MissingKeyError, settings
from .graph import ask, astream_events, mermaid_diagram
from .observability import status as langfuse_status

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Print the capability banner on boot, so a missing key is obvious in the logs."""
    print(settings.capability_report())
    yield


app = FastAPI(
    title="Multi-Agent AI Analyst",
    version=__version__,
    description="Supervisor-led multi-agent system: RAG + web + text-to-SQL + sandboxed code, verified by a critic.",
    lifespan=lifespan,
)

def cors_kwargs(cfg: Optional[Any] = None) -> Dict[str, Any]:
    """Build the CORSMiddleware configuration from settings.

    A pure function of config rather than inline setup, so the allowlist can be
    unit tested against any configuration without reimporting this module -
    reloading it would rebind exception classes and break identity checks
    elsewhere in the suite.
    """
    cfg = cfg or settings
    kwargs: Dict[str, Any] = {
        "allow_origins": cfg.cors_origins or ["*"],
        # False on purpose: no cookies or auth headers cross the boundary, which
        # is what keeps a regex/wildcard origin safe here.
        "allow_credentials": False,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if cfg.cors_origin_regex:
        kwargs["allow_origin_regex"] = cfg.cors_origin_regex
    return kwargs


app.add_middleware(CORSMiddleware, **cors_kwargs())

logger.info(
    "CORS allowlist: %s%s",
    settings.cors_origins or ["*"],
    f" | regex: {settings.cors_origin_regex}" if settings.cors_origin_regex else "",
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    enable_critic: bool = True
    use_memory: bool = True
    session_id: Optional[str] = None


class AskResponse(BaseModel):
    question: str
    answer: str
    steps: List[str]
    sources: List[Dict[str, Any]]
    revisions: int
    sql_result: Optional[str] = None
    code_result: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/")
def root() -> Dict[str, Any]:
    """Service card.

    Without this, visiting the deployed URL in a browser returns a bare 404 -
    which looks broken to anyone you share the link with.
    """
    return {
        "service": "Multi-Agent AI Analyst",
        "version": __version__,
        "description": (
            "A supervisor routes each question to specialist agents "
            "(documents, web, SQL, sandboxed code); a critic verifies the answer."
        ),
        "endpoints": {
            "health": "/health",
            "diagnostics": "/diagnostics",
            "graph": "/graph",
            "ask": "POST /ask",
            "stream": "GET /ask/stream?q=... | POST /ask/stream",
            "docs": "/docs",
        },
        "try_it": "/ask/stream?q=How%20many%20customers%20churned%20in%20Q2%202026%20and%20why",
    }


@app.get("/diagnostics")
def diagnostics() -> Dict[str, Any]:
    """Is this deployment actually *ready to answer*, not merely running?

    ``/health`` says the process is up. This says the data is in place - which
    is the failure people actually hit: the API boots perfectly, but nobody ran
    ingestion, so the retriever silently returns nothing and every "why"
    question comes back thin.

    Deliberately NOT part of /health: Render pings that endpoint constantly and
    a Qdrant round-trip on every ping is waste.
    """
    report: Dict[str, Any] = {
        "vector_store": {
            "mode": "cloud" if settings.uses_qdrant_cloud else "embedded",
            "location": settings.qdrant_url or str(settings.qdrant_dir),
            "embed_provider": settings.embed_provider,
            "embed_model": settings.embed_model,
            "configured_dim": settings.embed_dim,
        },
        "database": {"path": str(settings.db_path), "exists": settings.db_path.exists()},
    }

    # --- documents collection ---------------------------------------------
    try:
        from .vectorstore import count

        docs = count(settings.qdrant_collection)
        report["vector_store"]["documents_collection"] = settings.qdrant_collection
        report["vector_store"]["document_vectors"] = docs
        report["vector_store"]["ingested"] = docs > 0
        if docs == 0:
            report["vector_store"]["fix"] = (
                "Collection is empty - the retriever will return nothing. "
                "Ingest from your machine with QDRANT_URL set: "
                "`cd backend && python -m ingestion.ingest --reset`, "
                "or redeploy once with AUTO_INGEST=true."
            )
    except Exception as exc:
        report["vector_store"]["error"] = f"{type(exc).__name__}: {exc}"
        report["vector_store"]["ingested"] = False

    # --- memory collection -------------------------------------------------
    try:
        from .memory import size

        report["vector_store"]["memory_collection"] = settings.qdrant_memory_collection
        report["vector_store"]["memory_turns"] = size()
    except Exception as exc:
        report["vector_store"]["memory_error"] = str(exc)

    # --- database sanity ---------------------------------------------------
    if settings.db_path.exists():
        try:
            import sqlite3

            conn = sqlite3.connect(f"file:{settings.db_path}?mode=ro", uri=True)
            try:
                customers = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
                q2 = conn.execute(
                    "SELECT COUNT(*) FROM churn_events "
                    "WHERE churn_date BETWEEN '2026-04-01' AND '2026-06-30'"
                ).fetchone()[0]
            finally:
                conn.close()
            report["database"].update(
                {
                    "customers": customers,
                    "q2_2026_churns": q2,
                    "seed_correct": customers == 180 and q2 == 12,
                }
            )
        except Exception as exc:
            report["database"]["error"] = f"{type(exc).__name__}: {exc}"

    ready = bool(report["vector_store"].get("ingested")) and report["database"].get("seed_correct")
    report["ready_to_answer"] = bool(ready)
    return report


@app.get("/health")
def health() -> Dict[str, Any]:
    """Liveness plus a truthful report of which integrations are live."""
    try:
        settings.require_llm_key()
        llm_ready = True
        llm_error = None
    except MissingKeyError as exc:
        llm_ready = False
        llm_error = str(exc)

    return {
        "status": "ok" if llm_ready else "degraded",
        "version": __version__,
        "llm_ready": llm_ready,
        "llm_error": llm_error,
        "provider": settings.llm_provider,
        "model": settings.chat_model,
        "capabilities": {
            "web_search": settings.has_tavily,
            "tracing": settings.has_langfuse,
            "database": settings.db_path.exists(),
            "qdrant": "cloud" if settings.uses_qdrant_cloud else "embedded",
            "embed_provider": settings.embed_provider,
            "embed_model": settings.embed_model,
        },
        "langfuse": langfuse_status(),
    }


@app.get("/graph")
def graph_diagram(critic: bool = True) -> Dict[str, str]:
    return {"mermaid": mermaid_diagram(enable_critic=critic)}


@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(req: AskRequest) -> AskResponse:
    """Blocking answer. Useful for scripts, tests, and health checks."""
    try:
        settings.require_llm_key()
    except MissingKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    state = await asyncio.to_thread(
        ask,
        req.question,
        enable_critic=req.enable_critic,
        use_memory=req.use_memory,
        session_id=req.session_id,
    )

    return AskResponse(
        question=req.question,
        answer=state.get("answer", ""),
        steps=state.get("steps", []),
        sources=state.get("sources", []),
        revisions=state.get("revisions", 0),
        sql_result=state.get("sql_result"),
        code_result=state.get("code_result"),
    )


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


async def _event_stream(
    question: str, enable_critic: bool, use_memory: bool, session_id: Optional[str]
) -> AsyncIterator[str]:
    yield _sse({"type": "start", "question": question})
    try:
        async for event in astream_events(
            question,
            enable_critic=enable_critic,
            use_memory=use_memory,
            session_id=session_id,
        ):
            yield _sse(event)
    except Exception as exc:
        logger.exception("Stream failed")
        yield _sse({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
    yield "data: [DONE]\n\n"


SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # stops nginx/Render buffering the stream
}


@app.post("/ask/stream")
async def ask_stream_post(req: AskRequest) -> StreamingResponse:
    """SSE stream consumed by the Next.js UI via fetch()."""
    try:
        settings.require_llm_key()
    except MissingKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return StreamingResponse(
        _event_stream(req.question, req.enable_critic, req.use_memory, req.session_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@app.get("/ask/stream")
async def ask_stream_get(
    q: str = Query(min_length=1, max_length=2000),
    critic: bool = True,
    memory: bool = True,
    session_id: Optional[str] = None,
) -> StreamingResponse:
    """Same stream over GET, so `curl -N` and EventSource work unchanged."""
    try:
        settings.require_llm_key()
    except MissingKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return StreamingResponse(
        _event_stream(q, critic, memory, session_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.api:app", host="0.0.0.0", port=settings.port, reload=False)
