"""F12 - Observability (Langfuse).

Attaches a Langfuse callback handler to every graph run so one trace shows the
full path (supervisor -> data -> code -> critic), every LLM call, token counts
and cost.

Strictly optional: with no LANGFUSE_* keys, ``get_callbacks()`` returns an empty
list and the system runs exactly as before. Langfuse v2 and v3 moved the handler
import path, so both are tried.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any, List, Optional

from .config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _handler_class():
    """Locate CallbackHandler across langfuse major versions."""
    try:  # langfuse v2
        from langfuse.callback import CallbackHandler  # type: ignore

        return CallbackHandler
    except Exception:
        pass
    try:  # langfuse v3
        from langfuse.langchain import CallbackHandler  # type: ignore

        return CallbackHandler
    except Exception:
        return None


@lru_cache(maxsize=1)
def _export_env() -> bool:
    """v3's handler reads keys from the environment, not from kwargs."""
    if not settings.has_langfuse:
        return False
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
    os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)
    return True


def get_callbacks(session_id: Optional[str] = None, user_id: Optional[str] = None) -> List[Any]:
    """Callback list for ``app.invoke(state, config={"callbacks": ...})``.

    Empty list when Langfuse is not configured - tracing off, nothing breaks.
    """
    if not settings.has_langfuse:
        return []

    cls = _handler_class()
    if cls is None:
        logger.info("langfuse is not installed - tracing disabled.")
        return []

    _export_env()

    # v2 accepts credentials + session metadata as kwargs; v3 accepts neither.
    for kwargs in (
        {
            "public_key": settings.langfuse_public_key,
            "secret_key": settings.langfuse_secret_key,
            "host": settings.langfuse_host,
            "session_id": session_id,
            "user_id": user_id,
        },
        {},
    ):
        try:
            return [cls(**{k: v for k, v in kwargs.items() if v is not None})]
        except TypeError:
            continue
        except Exception as exc:
            logger.warning("Langfuse handler could not be created: %s", exc)
            return []

    return []


def flush() -> None:
    """Force-send buffered traces. Call before a short-lived process exits."""
    if not settings.has_langfuse:
        return
    try:
        from langfuse import Langfuse  # type: ignore

        Langfuse().flush()
    except Exception as exc:
        logger.debug("Langfuse flush skipped: %s", exc)


def status() -> str:
    if not settings.has_langfuse:
        return "Langfuse: disabled (set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable)"
    if _handler_class() is None:
        return "Langfuse: keys present but the SDK is not installed (pip install langfuse)"
    return f"Langfuse: enabled -> {settings.langfuse_host}"


__all__ = ["get_callbacks", "flush", "status"]


if __name__ == "__main__":
    print(status())
