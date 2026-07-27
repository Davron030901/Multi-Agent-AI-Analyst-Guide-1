"""Pytest configuration.

Tests come in two flavours:

* **offline** (the default) - no API key, no network, fully deterministic. These
  cover the guards and rails that must never regress: the SQL read-only guard,
  the code sandbox, graceful degradation, routing logic, graph structure.
* **live** (``-m live``) - hits the real Gemini/Qdrant/SQLite stack. Auto-skipped
  when ``GOOGLE_API_KEY`` is absent, so ``pytest`` is always green on a clean
  checkout.

Run:
    pytest                 # offline suite
    pytest -m live         # live suite (needs .env + seeded DB + ingested docs)
    pytest -m "not live"   # explicit offline
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.state import new_state  # noqa: E402


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "live: requires real API keys and network access")


def pytest_collection_modifyitems(config: pytest.Config, items) -> None:
    if settings.llm_key_present and settings.embed_key_present:
        return
    skip = pytest.mark.skip(
        reason="no usable LLM/embedding key (GOOGLE_API_KEY / OPENAI_API_KEY) - live tests skipped"
    )
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def state():
    """A fresh AgentState factory."""
    return new_state


@pytest.fixture(scope="session")
def db_available() -> bool:
    return settings.db_path.exists()


@pytest.fixture
def require_db(db_available: bool):
    if not db_available:
        pytest.skip(f"database not seeded at {settings.db_path} - run `python -m ingestion.seed_db`")
