"""One-command demonstration of every "Done when" criterion.

    cd backend && python -m scripts.smoke

Each check maps to a rubric line. Anything that needs a key you have not set is
reported as SKIP rather than FAIL, so the output is an honest picture of what is
actually working.

Use ``--offline`` to run only the checks that need no API key at all.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from pathlib import Path
from typing import Callable, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: List[Tuple[str, str, str, str]] = []  # (feature, name, status, detail)


def check(feature: str, name: str):
    """Decorator turning a function into a reported check.

    The function returns ``(status, detail)`` or raises - a raise is a FAIL with
    the exception recorded, never a crashed script.
    """

    def wrapper(fn: Callable[[], Tuple[str, str]]):
        started = time.perf_counter()
        try:
            status, detail = fn()
        except Exception as exc:
            status, detail = FAIL, f"{type(exc).__name__}: {exc}"
            if "--traceback" in sys.argv:
                traceback.print_exc()
        elapsed = time.perf_counter() - started
        results.append((feature, name, status, f"{detail} [{elapsed:.1f}s]"))
        icon = {PASS: "+", FAIL: "x", SKIP: "-"}[status]
        print(f"  [{icon}] {feature:<4} {name:<44} {status:<5} {detail}")
        return fn

    return wrapper


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="skip everything needing an API key")
    parser.add_argument("--traceback", action="store_true")
    args = parser.parse_args()

    print("=" * 100)
    print("MULTI-AGENT AI ANALYST - SMOKE TEST")
    print("=" * 100)
    print(settings.capability_report())
    print("\nChecks:")

    has_llm = settings.llm_key_present and settings.embed_key_present
    live = has_llm and not args.offline

    # ---------------- F1 ---------------------------------------------------
    @check("F1", "shared state initialises every field")
    def _f1a():
        from app.state import new_state

        state = new_state("q")
        required = {"question", "plan", "documents", "sql_result", "code_result",
                    "answer", "steps", "revisions", "memory", "sources"}
        missing = required - set(state)
        return (PASS, f"{len(required)} fields") if not missing else (FAIL, f"missing {missing}")

    @check("F1", "keys load from .env")
    def _f1b():
        if not has_llm:
            return SKIP, "no GOOGLE_API_KEY in .env"
        return PASS, f"provider={settings.llm_provider}"

    # ---------------- F2 ---------------------------------------------------
    @check("F2", "database is seeded")
    def _f2a():
        import sqlite3

        if not settings.db_path.exists():
            return FAIL, "run `python -m ingestion.seed_db`"
        conn = sqlite3.connect(settings.db_path)
        try:
            n = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
            churn = conn.execute(
                "SELECT COUNT(*) FROM churn_events WHERE churn_date BETWEEN '2026-04-01' AND '2026-06-30'"
            ).fetchone()[0]
        finally:
            conn.close()
        ok = n == 180 and churn == 12
        return (PASS if ok else FAIL), f"{n} customers, {churn} Q2-2026 churns (expect 180 / 12)"

    @check("F2", "similarity search returns relevant chunks")
    def _f2b():
        if not live:
            return SKIP, "needs an API key"
        from app.vectorstore import count, similarity_search

        total = count()
        if total == 0:
            return FAIL, "collection empty - run `python -m ingestion.ingest`"
        hits = similarity_search("Why did customers churn in Q2 2026?", k=3)
        joined = " ".join(h.page_content for h in hits).upper()
        relevant = "MISSING_FEATURE" in joined or "CHURN" in joined
        return (PASS if relevant else FAIL), f"{total} vectors, {len(hits)} hits, relevant={relevant}"

    # ---------------- F3-F6 ------------------------------------------------
    @check("F3", "retriever returns correct chunks (alone)")
    def _f3():
        if not live:
            return SKIP, "needs an API key"
        from app.agents.retriever import retriever_agent
        from app.state import new_state

        out = retriever_agent(new_state("What are our churn reason codes?"))
        n = len(out["documents"])
        hit = "MISSING_FEATURE" in " ".join(out["documents"]).upper()
        return (PASS if n and hit else FAIL), f"{n} chunks, reason codes found={hit}"

    @check("F4", "web agent skips cleanly without a key")
    def _f4a():
        from app.agents.web import web_agent
        from app.state import new_state

        out = web_agent(new_state("anything"))  # must never raise
        if settings.has_tavily:
            return PASS, "key present - see next check"
        return (PASS if "skipped" in out["steps"][-1] else FAIL), out["steps"][-1]

    @check("F4", "web agent returns live results")
    def _f4b():
        if not settings.has_tavily:
            return SKIP, "no TAVILY_API_KEY"
        from app.agents.web import web_agent
        from app.state import new_state

        out = web_agent(new_state("What is LangGraph by LangChain?"))
        n = len(out["documents"])
        return (PASS if n else FAIL), f"{n} results"

    @check("F5", "SQL guard rejects every non-SELECT")
    def _f5a():
        from app.sql_guard import is_read_only

        bad = ["DROP TABLE customers", "DELETE FROM churn_events",
               "UPDATE customers SET segment='x'", "SELECT 1; DROP TABLE customers",
               "PRAGMA table_info(customers)", "INSERT INTO customers VALUES (1)"]
        good = ["SELECT COUNT(*) FROM churn_events",
                "WITH q AS (SELECT 1) SELECT * FROM q"]
        leaked = [s for s in bad if is_read_only(s)]
        blocked = [s for s in good if not is_read_only(s)]
        ok = not leaked and not blocked
        return (PASS if ok else FAIL), f"{len(bad)} writes blocked, {len(good)} reads allowed"

    @check("F5", "data agent returns the right number")
    def _f5b():
        if not live or not settings.db_path.exists():
            return SKIP, "needs an API key and a seeded DB"
        from app.agents.data import data_agent
        from app.state import new_state

        out = data_agent(new_state("How many customers churned in Q2 2026?"))
        got = "12" in (out["sql_result"] or "")
        return (PASS if got else FAIL), f"expected 12 -> {' '.join(str(out['sql_result']).split())[:110]}"

    @check("F6", "sandbox blocks dangerous code")
    def _f6a():
        from app.sandbox import run_code

        blocked = run_code("import os\nprint(os.listdir('/'))")
        timed = run_code("while True: pass", timeout=2)
        ok = blocked.violation is not None and timed.timed_out
        return (PASS if ok else FAIL), f"import blocked={blocked.violation is not None}, timeout works={timed.timed_out}"

    @check("F6", "sandbox computes exact math")
    def _f6b():
        from app.sandbox import run_code

        out = run_code("print(round(7362 / 865239 * 100, 2))")
        return (PASS if out.stdout.strip() == "0.85" else FAIL), f"got {out.stdout.strip()!r}, expected '0.85'"

    @check("F6", "code agent returns a correct computed answer")
    def _f6c():
        if not live:
            return SKIP, "needs an API key"
        from app.agents.code import code_agent
        from app.state import new_state

        out = code_agent(new_state("What is 1234 multiplied by 5678? Print the result."))
        ok = "7006652" in (out["code_result"] or "").replace(",", "")
        return (PASS if ok else FAIL), f"expected 7006652 -> {' '.join(str(out['code_result']).split())[:110]}"

    # ---------------- F7-F9 ------------------------------------------------
    @check("F7", "supervisor routes by question type")
    def _f7():
        if not live:
            from app.agents.supervisor import heuristic_route
            from app.state import new_state

            ok = (heuristic_route(new_state("How many customers churned?")) == "data"
                  and heuristic_route(new_state("Why did they leave?")) == "retriever")
            return (PASS if ok else FAIL), "heuristic router (LLM routing needs a key)"

        from app.agents.supervisor import supervisor
        from app.state import new_state

        numeric = supervisor(new_state("How many customers churned in Q2 2026?"))["plan"]
        textual = supervisor(new_state("What does our SLA policy say about P1 tickets?"))["plan"]
        ok = numeric == "data" and textual == "retriever"
        return (PASS if ok else FAIL), f"numeric->{numeric}, document->{textual}"

    @check("F8", "critic catches an ungrounded answer")
    def _f8():
        from app.agents.critic import heuristic_verdict
        from app.state import new_state

        bad = new_state("How many churned?")
        bad["answer"] = "About 500 customers churned."  # confident, zero evidence
        good = new_state("How many churned?")
        good["answer"] = "12 customers churned."
        good["sql_result"] = "SELECT COUNT(*) ...\n-> [(12,)]"

        ok = heuristic_verdict(bad).ok is False and heuristic_verdict(good).ok is True
        if not live:
            return (PASS if ok else FAIL), "heuristic gate (LLM critic needs a key)"

        from app.agents.critic import critic

        verdict = critic(bad)
        caught = verdict["revisions"] > 0
        return (PASS if ok and caught else FAIL), f"ungrounded answer rejected={caught}"

    @check("F9", "graph compiles with all 7 nodes")
    def _f9a():
        from app.graph import build_graph

        nodes = set(build_graph(True).get_graph().nodes)
        expected = {"supervisor", "retriever", "web", "data", "code", "generate", "critic"}
        missing = expected - nodes
        return (PASS if not missing else FAIL), f"{len(expected)} nodes" if not missing else f"missing {missing}"

    @check("F9", "multi-part question runs end-to-end and terminates")
    def _f9b():
        if not live or not settings.db_path.exists():
            return SKIP, "needs an API key and a seeded DB"
        from app.graph import ask

        state = ask("How many customers churned in Q2 2026, and why did they leave?", use_memory=False)
        steps = state.get("steps", [])
        used_data = any(s.startswith("data") for s in steps)
        used_ret = any(s.startswith("retriever") for s in steps)
        terminated = len(steps) < settings.recursion_limit and bool(state.get("answer"))
        ok = used_data and used_ret and terminated
        return (PASS if ok else FAIL), f"{len(steps)} steps, data={used_data}, retriever={used_ret}, terminated={terminated}"

    # ---------------- F10-F12 ---------------------------------------------
    @check("F10", "long-term memory recalls an earlier turn")
    def _f10():
        if not live:
            return SKIP, "needs an API key"
        from app.memory import clear, recall, remember

        clear()
        remember("How many customers churned in Q2 2026?",
                 "12 customers churned in Q2 2026, losing $7,362 of MRR.")
        hits = recall("and the quarter before that?")
        ok = bool(hits) and "Q2 2026" in " ".join(hits)
        return (PASS if ok else FAIL), f"{len(hits)} past turn(s) recalled"

    @check("F11", "evaluation test set covers every agent")
    def _f11():
        from eval.testset import TEST_SET, by_type

        counts = {t: len(by_type(t)) for t in ("doc", "sql", "web", "multihop")}
        ok = len(TEST_SET) >= 10 and all(counts.values())
        return (PASS if ok else FAIL), f"{len(TEST_SET)} cases {counts}"

    @check("F12", "Langfuse tracing configured")
    def _f12():
        from app.observability import get_callbacks, status

        if not settings.has_langfuse:
            return SKIP, "no LANGFUSE_* keys (tracing is optional)"
        cbs = get_callbacks(session_id="smoke")
        return (PASS if cbs else FAIL), status()

    # ---------------- report ----------------------------------------------
    print("\n" + "=" * 100)
    passed = sum(1 for *_, s, _ in results if s == PASS)
    failed = sum(1 for *_, s, _ in results if s == FAIL)
    skipped = sum(1 for *_, s, _ in results if s == SKIP)
    print(f"SUMMARY: {passed} passed, {failed} failed, {skipped} skipped")

    if failed:
        print("\nFailures:")
        for feature, name, status, detail in results:
            if status == FAIL:
                print(f"  {feature} {name}: {detail}")

    if skipped:
        print("\nSkipped (missing an optional key, or --offline):")
        for feature, name, status, detail in results:
            if status == SKIP:
                print(f"  {feature} {name}: {detail}")

    print("=" * 100)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
