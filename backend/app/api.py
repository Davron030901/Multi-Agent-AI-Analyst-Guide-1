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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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
