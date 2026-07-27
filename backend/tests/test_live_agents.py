"""Live tests - each specialist in isolation, then the full graph end-to-end.

Requires a real ``GOOGLE_API_KEY``, a seeded database and an ingested corpus:

    cd backend
    python -m ingestion.seed_db
    python -m ingestion.ingest
    pytest -m live -v

Auto-skipped without a key, so ``pytest`` stays green on a clean checkout.
"""

from __future__ import annotations

import pytest

from app.agents.code import code_agent
from app.agents.data import data_agent
from app.agents.retriever import retriever_agent
from app.agents.web import web_agent
from app.config import settings
from app.graph import ask
from app.state import new_state

pytestmark = pytest.mark.live


# ---------------------------------------------------------------------------
# F3 - retriever in isolation
# ---------------------------------------------------------------------------


class TestRetrieverAgent:
    def test_returns_relevant_chunks(self) -> None:
        out = retriever_agent(new_state("What are our churn reason codes?"))

        assert out["documents"], "retriever returned nothing - did you run `python -m ingestion.ingest`?"
        joined = " ".join(out["documents"]).upper()
        assert "MISSING_FEATURE" in joined or "REASON CODE" in joined

    def test_respects_top_k(self) -> None:
        out = retriever_agent(new_state("What is the P1 SLA?"))
        assert 0 < len(out["documents"]) <= settings.retriever_top_k

    def test_records_sources(self) -> None:
        out = retriever_agent(new_state("What is on the roadmap?"))
        assert out["sources"]
        assert all(s["type"] == "document" for s in out["sources"])


# ---------------------------------------------------------------------------
# F4 - web agent with a real key
# ---------------------------------------------------------------------------


class TestWebAgent:
    def test_returns_live_results(self) -> None:
        if not settings.has_tavily:
            pytest.skip("TAVILY_API_KEY not set")

        out = web_agent(new_state("What is LangGraph by LangChain?"))

        assert out["documents"], "no web results returned"
        assert any(step.startswith("web(") for step in out["steps"])


# ---------------------------------------------------------------------------
# F5 - data agent in isolation
# ---------------------------------------------------------------------------


class TestDataAgent:
    def test_counts_q2_churn_correctly(self, require_db) -> None:
        out = data_agent(new_state("How many customers churned in Q2 2026?"))

        assert out["sql_result"]
        assert "12" in out["sql_result"], f"expected 12 churns, got: {out['sql_result']}"

    def test_generated_sql_is_a_select(self, require_db) -> None:
        out = data_agent(new_state("How many active subscriptions are there?"))
        first_line = out["sql_result"].split("\n")[0].strip().lower()
        assert first_line.startswith("select") or first_line.startswith("with")

    def test_totals_active_mrr(self, require_db) -> None:
        out = data_agent(new_state("What is the total MRR across all active subscriptions?"))
        digits = out["sql_result"].replace(",", "")
        assert "865239" in digits or "865,239" in out["sql_result"]

    def test_refuses_a_destructive_request(self, require_db) -> None:
        """Even asked directly to delete, nothing may be executed."""
        out = data_agent(new_state("Delete all rows from the customers table."))
        result = out["sql_result"].lower()
        assert "drop" not in result.split("->")[0]
        assert "delete from" not in result.split("->")[0]


# ---------------------------------------------------------------------------
# F6 - code agent in isolation
# ---------------------------------------------------------------------------


class TestCodeAgent:
    def test_computes_a_percentage_correctly(self) -> None:
        out = code_agent(
            new_state(
                "We lost 7362 dollars of MRR out of 865239 total active MRR. "
                "What percentage is that? Round to two decimals."
            )
        )
        assert out["code_result"]
        assert "0.85" in out["code_result"]

    def test_does_exact_arithmetic(self) -> None:
        out = code_agent(new_state("What is 1234 multiplied by 5678?"))
        assert "7006652" in out["code_result"].replace(",", "")


# ---------------------------------------------------------------------------
# F9 - end-to-end through the whole graph
# ---------------------------------------------------------------------------


class TestEndToEnd:
    def test_multi_part_question_uses_multiple_agents_and_terminates(self, require_db) -> None:
        state = ask(
            "How many customers churned in Q2 2026, and why did they leave?",
            use_memory=False,
        )

        assert state.get("answer"), "no answer produced"
        steps = state["steps"]

        assert any(s.startswith("data") for s in steps), f"data agent never ran: {steps}"
        assert any(s.startswith("retriever") for s in steps), f"retriever never ran: {steps}"
        assert any(s.startswith("critic") for s in steps), f"critic never ran: {steps}"
        assert "12" in state["answer"]
        assert len(steps) < settings.recursion_limit, "graph did not terminate cleanly"

    def test_sql_only_question_short_circuits(self, require_db) -> None:
        state = ask("How many customers churned in Q2 2026?", use_memory=False)
        assert "12" in state["answer"]

    def test_document_only_question(self) -> None:
        state = ask("What is our P1 resolution target?", use_memory=False)
        assert "8" in state["answer"]

    def test_revisions_never_exceed_the_budget(self, require_db) -> None:
        state = ask("How many customers churned in Q2 2026, and why?", use_memory=False)
        assert state.get("revisions", 0) <= settings.max_revisions + 1


# ---------------------------------------------------------------------------
# F10 - long-term memory
# ---------------------------------------------------------------------------


class TestMemory:
    def test_follow_up_uses_earlier_context(self, require_db) -> None:
        from app.memory import clear, recall, remember

        clear()
        remember(
            "How many customers churned in Q2 2026?",
            "12 customers churned in Q2 2026, losing $7,362 of MRR.",
        )

        recalled = recall("and what about the quarter before that?")

        assert recalled, "memory recalled nothing"
        assert "Q2 2026" in " ".join(recalled)
