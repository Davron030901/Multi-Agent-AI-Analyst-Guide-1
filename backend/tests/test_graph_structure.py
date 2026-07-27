"""F9 - the graph must have the right shape and must always terminate.

Structural, offline: no LLM is called. It verifies that every node exists, that
every specialist returns to the supervisor, and that the critic can be disabled
for the evaluation comparison.
"""

from __future__ import annotations

from app.config import settings
from app.graph import build_graph, mermaid_diagram


class TestGraphShape:
    def test_compiles_with_critic(self) -> None:
        assert build_graph(enable_critic=True) is not None

    def test_compiles_without_critic(self) -> None:
        assert build_graph(enable_critic=False) is not None

    def test_has_every_expected_node(self) -> None:
        nodes = set(build_graph(True).get_graph().nodes)
        for expected in ("supervisor", "retriever", "web", "data", "code", "generate", "critic"):
            assert expected in nodes, f"node '{expected}' is missing from the graph"

    def test_critic_absent_when_disabled(self) -> None:
        assert "critic" not in set(build_graph(False).get_graph().nodes)

    def test_every_specialist_returns_to_the_supervisor(self) -> None:
        edges = build_graph(True).get_graph().edges
        pairs = {(e.source, e.target) for e in edges}
        for agent in ("retriever", "web", "data", "code"):
            assert (agent, "supervisor") in pairs, f"{agent} does not hand control back"

    def test_generate_feeds_the_critic(self) -> None:
        pairs = {(e.source, e.target) for e in build_graph(True).get_graph().edges}
        assert ("generate", "critic") in pairs


class TestTerminationRails:
    def test_recursion_limit_is_configured(self) -> None:
        assert settings.recursion_limit > 0

    def test_revision_budget_is_finite(self) -> None:
        assert 0 <= settings.max_revisions < 10

    def test_step_budget_leaves_headroom_for_generate_and_critic(self) -> None:
        # The supervisor forces `finish` at recursion_limit - 6; that reserve has
        # to be positive or the run can never reach the generate node.
        assert settings.recursion_limit - 6 > 0


class TestDiagram:
    def test_mermaid_renders(self) -> None:
        diagram = mermaid_diagram(True)
        assert "supervisor" in diagram.lower()
        assert len(diagram) > 50
