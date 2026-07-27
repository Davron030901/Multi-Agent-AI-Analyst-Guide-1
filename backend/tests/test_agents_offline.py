"""Offline agent behaviour: graceful degradation, routing logic, the critic gate.

No API key, no network. These lock in the deterministic rails that the rubric
grades: F4's graceful skip, F7's routing, F8's revision loop and termination.
"""

from __future__ import annotations

import pytest

from app.agents.critic import Verdict, heuristic_verdict, route_after_critic
from app.agents.supervisor import SPECIALISTS, heuristic_route, route_from_supervisor
from app.agents.web import web_agent
from app.config import settings
from app.state import evidence_summary, new_state


# ---------------------------------------------------------------------------
# F4 - web agent graceful degradation
# ---------------------------------------------------------------------------


class TestWebAgentGracefulSkip:
    def test_skips_cleanly_without_a_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(type(settings), "has_tavily", property(lambda _: False))

        out = web_agent(new_state("what is langgraph?"))

        assert out["documents"] == []          # no evidence, but...
        assert "web:skipped" in out["steps"][-1]  # ...it recorded WHY, and did not raise

    def test_returns_a_dict_not_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(type(settings), "has_tavily", property(lambda _: False))
        assert isinstance(web_agent(new_state("q")), dict)

    def test_network_failure_is_contained(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # `tavily_api_key` is a dataclass field on a frozen instance, so it is
        # shadowed with a class-level property rather than assigned.
        monkeypatch.setattr(type(settings), "has_tavily", property(lambda _: True))
        monkeypatch.setattr(
            type(settings), "tavily_api_key", property(lambda _: "tvly-invalid"), raising=False
        )

        out = web_agent(new_state("anything"))  # must not raise

        assert isinstance(out, dict)
        assert any("web" in step for step in out["steps"])


# ---------------------------------------------------------------------------
# F7 - routing
# ---------------------------------------------------------------------------


class TestRouting:
    @pytest.mark.parametrize(
        "question,expected",
        [
            ("How many customers churned in Q2 2026?", "data"),
            ("What is the total active MRR?", "data"),
            ("Give me the breakdown of churn by reason code", "data"),
            ("What is the average P1 resolution time?", "data"),
            ("Why did customers leave?", "retriever"),
            ("What is our SLA policy?", "retriever"),
            ("What is on the roadmap?", "retriever"),
        ],
    )
    def test_heuristic_routes_by_question_type(self, question: str, expected: str) -> None:
        assert heuristic_route(new_state(question)) == expected

    def test_does_not_redispatch_a_used_agent(self) -> None:
        state = new_state("How many customers churned?")
        state["steps"] = ["supervisor->data", "data(sql):ok(attempt 1)"]
        assert heuristic_route(state) != "data"

    def test_route_from_supervisor_maps_plan(self) -> None:
        for agent in SPECIALISTS:
            state = new_state("q")
            state["plan"] = agent
            assert route_from_supervisor(state) == agent

    def test_unknown_plan_falls_back_to_finish(self) -> None:
        state = new_state("q")
        state["plan"] = "nonsense"
        assert route_from_supervisor(state) == "finish"

    def test_empty_plan_falls_back_to_finish(self) -> None:
        assert route_from_supervisor(new_state("q")) == "finish"


# ---------------------------------------------------------------------------
# F8 - critic gate and termination
# ---------------------------------------------------------------------------


class TestCriticGate:
    def test_approved_ends_the_run(self) -> None:
        state = new_state("q")
        state["steps"] = ["generate", "critic:approved"]
        assert route_after_critic(state) == "finish"

    def test_rejection_loops_back_to_supervisor(self) -> None:
        state = new_state("q")
        state["steps"] = ["generate", "critic:rejected(1/2) - unsupported number"]
        state["revisions"] = 1
        assert route_after_critic(state) == "revise"

    def test_revision_budget_forces_termination(self) -> None:
        state = new_state("q")
        state["steps"] = ["generate", "critic:rejected(budget exhausted)"]
        state["revisions"] = settings.max_revisions + 1
        assert route_after_critic(state) == "finish", "the graph must terminate"

    def test_heuristic_rejects_an_empty_answer(self) -> None:
        verdict = heuristic_verdict(new_state("q"))
        assert isinstance(verdict, Verdict)
        assert verdict.ok is False

    def test_heuristic_rejects_ungrounded_answers(self) -> None:
        state = new_state("q")
        state["answer"] = "42 customers churned."  # confident, but zero evidence
        assert heuristic_verdict(state).ok is False

    def test_heuristic_accepts_a_grounded_answer(self) -> None:
        state = new_state("q")
        state["answer"] = "12 customers churned."
        state["sql_result"] = "SELECT COUNT(*) ...\n-> [(12,)]"
        assert heuristic_verdict(state).ok is True


# ---------------------------------------------------------------------------
# F1 - shared state
# ---------------------------------------------------------------------------


class TestSharedState:
    def test_new_state_is_fully_initialised(self) -> None:
        state = new_state("q")
        for key in ("question", "plan", "documents", "sql_result", "code_result",
                    "answer", "steps", "revisions", "memory", "sources"):
            assert key in state, f"{key} missing from AgentState"

    def test_evidence_summary_handles_an_empty_state(self) -> None:
        assert "no evidence" in evidence_summary(new_state("q"))

    def test_evidence_summary_includes_every_channel(self) -> None:
        state = new_state("q")
        state["documents"] = ["doc evidence"]
        state["sql_result"] = "SELECT 1\n-> [(1,)]"
        state["code_result"] = "print(2)\n-> 2"
        state["memory"] = ["Q: prior\nA: prior answer"]

        summary = evidence_summary(state)

        assert "doc evidence" in summary
        assert "SELECT 1" in summary
        assert "print(2)" in summary
        assert "prior answer" in summary
