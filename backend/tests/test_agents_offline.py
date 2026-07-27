"""Offline agent behaviour: graceful degradation, routing logic, the critic gate.

No API key, no network. These lock in the deterministic rails that the rubric
grades: F4's graceful skip, F7's routing, F8's revision loop and termination.
"""

from __future__ import annotations

import sys
from importlib import import_module

import pytest

# NOTE: `app/agents/__init__.py` re-exports the node functions, so the names
# `app.agents.critic` and `app.agents.supervisor` resolve to the FUNCTIONS, not
# the modules that contain them. monkeypatch.setattr("app.agents.critic", ...)
# therefore patches the wrong object. Fetch the real modules by name instead.
critic_module = import_module("app.agents.critic")
supervisor_module = import_module("app.agents.supervisor")
assert critic_module is sys.modules["app.agents.critic"]

from app.agents.critic import (
    Verdict,
    _is_repeat_complaint,
    critic,
    heuristic_verdict,
    route_after_critic,
)
from app.agents.supervisor import (
    MAX_AGENT_RUNS,
    SPECIALISTS,
    _agent_run_counts,
    heuristic_route,
    route_from_supervisor,
    supervisor,
)
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
# Regression: observed production failures
# ---------------------------------------------------------------------------


class TestRedispatchLoopRegression:
    """Observed on the live deployment (gpt-4o-mini).

    After the critic rejected twice, the supervisor dispatched 'code' FIVE
    times in a row with byte-identical code, stopping only when the step budget
    fired. Cause: the re-dispatch guard was gated on ``revisions == 0``, so any
    critic rejection switched it off completely.
    """

    def test_run_counts_ignore_supervisor_steps(self) -> None:
        steps = ["supervisor->code", "code:ok(attempt 1)", "supervisor->code", "code:ok(attempt 1)"]
        assert _agent_run_counts(steps) == {"code": 2}

    @staticmethod
    def _force_route(monkeypatch: pytest.MonkeyPatch, agent: str) -> None:
        """Make the router insist on ``agent``, so we test the RAIL, not the LLM."""
        from app.agents.supervisor import Route

        class _Stub:
            def invoke(self, _prompt):
                return Route(next=agent, reason=f"forced {agent}")

        monkeypatch.setattr(supervisor_module, "structured", lambda *a, **k: _Stub())

    def test_agent_capped_even_while_revising(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The exact live failure: revisions > 0 used to disable the guard."""
        self._force_route(monkeypatch, "code")

        state = new_state("How many churned and why?")
        state["revisions"] = 2
        state["critic_reason"] = "please confirm the total"
        state["steps"] = [
            "supervisor->code", "code:ok(attempt 1)",
            "supervisor->code", "code:ok(attempt 1)",
        ]

        out = supervisor(state)

        assert out["plan"] == "finish", (
            f"'code' already ran {MAX_AGENT_RUNS}x; the supervisor must stop "
            f"re-dispatching it, got '{out['plan']}'"
        )

    def test_second_run_allowed_when_a_revision_is_pending(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The cap must not be so tight that a legitimate retry is impossible."""
        self._force_route(monkeypatch, "data")

        state = new_state("How many churned?")
        state["revisions"] = 1
        state["critic_reason"] = "the count is not supported by the SQL result"
        state["steps"] = ["supervisor->data", "data(sql):ok(attempt 1)"]

        assert supervisor(state)["plan"] == "data"

    def test_no_rerun_without_a_pending_revision(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._force_route(monkeypatch, "data")

        state = new_state("How many churned?")
        state["steps"] = ["supervisor->data", "data(sql):ok(attempt 1)"]

        assert supervisor(state)["plan"] == "finish"

    def test_cap_allows_at_least_one_retry(self) -> None:
        assert MAX_AGENT_RUNS >= 2


class TestStuckCriticRegression:
    """Observed on the live deployment (gpt-4o-mini).

    The critic rejected twice with a self-contradicting reason: "the total is
    incorrectly stated as 12; the correct total is 12". Identical text both
    times - it was stuck, not discerning, and it burned the whole revision
    budget plus five code-agent calls.
    """

    def test_identical_reason_detected(self) -> None:
        reason = "The total number of churned customers is incorrectly stated as 12."
        assert _is_repeat_complaint(reason, reason)
        assert _is_repeat_complaint(reason.upper(), f"  {reason}  ")

    def test_different_reason_not_flagged(self) -> None:
        assert not _is_repeat_complaint("The MRR figure is unsupported.", "The count is wrong.")

    def test_no_previous_reason_is_not_a_repeat(self) -> None:
        assert not _is_repeat_complaint("anything", None)

    def test_repeat_complaint_breaks_the_loop(self, monkeypatch: pytest.MonkeyPatch) -> None:
        reason = "The total is incorrectly stated as 12; the correct total is 12."

        class _Stub:
            def invoke(self, _prompt):
                return Verdict(ok=False, reason=reason)

        monkeypatch.setattr(critic_module, "structured", lambda *a, **k: _Stub())

        state = new_state("How many churned?")
        state["answer"] = "12 customers churned."
        state["sql_result"] = "SELECT COUNT(*) ...\n-> [(12,)]"
        state["revisions"] = 1
        state["critic_reason"] = reason  # the SAME complaint as last round

        out = critic(state)

        assert out["steps"][-1].startswith("critic:approved"), "loop was not broken"
        assert out["revisions"] == 1, "a non-converging loop must not burn more budget"
        assert route_after_critic({**state, **out}) == "finish"

    def test_a_genuinely_new_complaint_still_rejects(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _Stub:
            def invoke(self, _prompt):
                return Verdict(ok=False, reason="The MRR figure does not appear in the evidence.")

        monkeypatch.setattr(critic_module, "structured", lambda *a, **k: _Stub())

        state = new_state("How much MRR did we lose?")
        state["answer"] = "We lost $9,999."
        state["sql_result"] = "SELECT ...\n-> [(7362.0,)]"
        state["revisions"] = 1
        state["critic_reason"] = "An entirely different earlier complaint."

        out = critic(state)

        assert out["revisions"] == 2
        assert "rejected" in out["steps"][-1]


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
