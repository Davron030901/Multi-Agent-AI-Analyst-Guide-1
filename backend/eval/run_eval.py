"""F11 - Evaluation harness.

Runs the fixed test set through the graph twice - **with** and **without** the
critic - and reports both, which is what makes the critic's value measurable
rather than asserted.

Metrics
-------
* **LLM-as-judge** (1-5 vs. the reference answer) - always available.
* **Exact-fact check** - deterministic substring assertion on the key figures.
  No LLM involved, so it cannot be gamed by fluent prose.
* **Routing accuracy** - did the supervisor actually dispatch the expected agents?
* **RAGAS** - faithfulness, answer relevancy, context precision, context recall.
  Skipped with a clear message if ragas is not installed, rather than crashing.

Run::

    python -m eval.run_eval                  # full 14-question set, both modes
    python -m eval.run_eval --quick          # 6-question subset (saves quota)
    python -m eval.run_eval --no-ragas       # judge + exact-fact only, much faster
    python -m eval.run_eval --mode with      # only the with-critic run
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import BACKEND_DIR, settings  # noqa: E402
from app.graph import ask  # noqa: E402
from app.observability import flush  # noqa: E402
from eval.judge import contains_check, judge_answer  # noqa: E402
from eval.testset import TEST_SET, EvalCase, quick_subset  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

RESULTS_DIR = BACKEND_DIR / "eval" / "results"
SPECIALISTS = ("retriever", "web", "data", "code")


# ---------------------------------------------------------------------------
# Running the system
# ---------------------------------------------------------------------------


def agents_from_steps(steps: List[str]) -> List[str]:
    return sorted({a for s in steps for a in SPECIALISTS if s.startswith(a)})


def run_case(case: EvalCase, enable_critic: bool) -> Dict[str, Any]:
    started = time.perf_counter()
    state = ask(case.question, enable_critic=enable_critic, use_memory=False, trace=True)
    elapsed = time.perf_counter() - started

    answer = state.get("answer", "") or ""
    steps = state.get("steps", []) or []
    used = agents_from_steps(steps)

    contexts: List[str] = list(state.get("documents", []) or [])
    if state.get("sql_result"):
        contexts.append(str(state["sql_result"]))
    if state.get("code_result"):
        contexts.append(str(state["code_result"]))

    verdict = judge_answer(case.question, answer, case.reference)
    facts_ok = contains_check(answer, case.must_contain)
    routing_ok = all(a in used for a in case.expected_agents) if case.expected_agents else None

    return {
        "id": case.id,
        "qtype": case.qtype,
        "question": case.question,
        "reference": case.reference,
        "answer": answer,
        "contexts": contexts,
        "steps": steps,
        "agents_used": used,
        "expected_agents": case.expected_agents,
        "routing_ok": routing_ok,
        "judge_score": verdict.score,
        "judge_reason": verdict.reason,
        "factual_errors": verdict.factual_errors,
        "facts_ok": facts_ok,
        "revisions": state.get("revisions", 0),
        "seconds": round(elapsed, 2),
    }


def run_all(cases: List[EvalCase], enable_critic: bool) -> List[Dict[str, Any]]:
    label = "WITH critic" if enable_critic else "WITHOUT critic"
    print(f"\n{'=' * 78}\nRunning {len(cases)} cases {label}\n{'=' * 78}")

    rows = []
    for i, case in enumerate(cases, 1):
        print(f"[{i}/{len(cases)}] {case.id:<10} {case.question[:60]}...", end="", flush=True)
        try:
            row = run_case(case, enable_critic)
        except Exception as exc:
            logger.error("Case %s crashed: %s", case.id, exc)
            row = {
                "id": case.id, "qtype": case.qtype, "question": case.question,
                "reference": case.reference, "answer": f"CRASHED: {exc}", "contexts": [],
                "steps": [], "agents_used": [], "expected_agents": case.expected_agents,
                "routing_ok": False, "judge_score": 1, "judge_reason": str(exc),
                "factual_errors": str(exc), "facts_ok": False, "revisions": 0, "seconds": 0.0,
            }
        flag = "ok" if row["judge_score"] >= 4 else ("~" if row["judge_score"] == 3 else "X")
        print(f"  [{flag}] judge={row['judge_score']}/5  facts={row['facts_ok']}  {row['seconds']}s")
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# RAGAS
# ---------------------------------------------------------------------------


def run_ragas(rows: List[Dict[str, Any]]) -> Dict[str, float]:
    """Score with RAGAS. Returns {} (with an explanation printed) if unavailable."""
    try:
        from ragas import EvaluationDataset, evaluate
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import (
            Faithfulness,
            LLMContextPrecisionWithReference,
            LLMContextRecall,
            ResponseRelevancy,
        )
    except ImportError as exc:
        print(f"\n[ragas skipped] {exc}. Install with:  pip install ragas datasets")
        return {}

    from app.llm import get_embeddings, get_llm

    usable = [r for r in rows if r["contexts"] and r["answer"]]
    if not usable:
        print("\n[ragas skipped] no rows had both contexts and an answer.")
        return {}

    dataset = EvaluationDataset.from_list(
        [
            {
                "user_input": r["question"],
                "retrieved_contexts": [str(c) for c in r["contexts"]],
                "response": r["answer"],
                "reference": r["reference"],
            }
            for r in usable
        ]
    )

    evaluator_llm = LangchainLLMWrapper(get_llm(temperature=0.0))
    evaluator_emb = LangchainEmbeddingsWrapper(get_embeddings())

    try:
        result = evaluate(
            dataset=dataset,
            metrics=[
                Faithfulness(),
                ResponseRelevancy(),
                LLMContextPrecisionWithReference(),
                LLMContextRecall(),
            ],
            llm=evaluator_llm,
            embeddings=evaluator_emb,
            show_progress=True,
        )
    except Exception as exc:
        print(f"\n[ragas failed] {type(exc).__name__}: {exc}")
        return {}

    scores: Dict[str, float] = {}
    try:
        df = result.to_pandas()
        for column in df.columns:
            if df[column].dtype.kind in "fc":
                series = df[column].dropna()
                if len(series):
                    scores[column] = round(float(series.mean()), 4)
    except Exception:
        for key, value in dict(result).items():
            try:
                scores[key] = round(float(value), 4)
            except (TypeError, ValueError):
                continue
    return scores


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def summarise(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    judged = [r["judge_score"] for r in rows]
    fact_rows = [r for r in rows if r["facts_ok"] is not None]
    route_rows = [r for r in rows if r["routing_ok"] is not None]

    return {
        "n": len(rows),
        "judge_mean": round(statistics.mean(judged), 2) if judged else 0.0,
        "judge_pass_rate": round(sum(1 for s in judged if s >= 4) / len(judged), 3) if judged else 0.0,
        "exact_fact_rate": round(sum(1 for r in fact_rows if r["facts_ok"]) / len(fact_rows), 3) if fact_rows else None,
        "routing_accuracy": round(sum(1 for r in route_rows if r["routing_ok"]) / len(route_rows), 3) if route_rows else None,
        "mean_revisions": round(statistics.mean([r["revisions"] for r in rows]), 2) if rows else 0.0,
        "mean_seconds": round(statistics.mean([r["seconds"] for r in rows]), 2) if rows else 0.0,
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


def markdown_table(headers: List[str], rows: List[List[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |",
             "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(_fmt(c) for c in row) + " |")
    return "\n".join(lines)


def build_report(results: Dict[str, Dict[str, Any]], cases: List[EvalCase]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    model = settings.chat_model

    out = [
        "# Evaluation report - Multi-Agent AI Analyst",
        "",
        f"Generated: {now}  |  Provider: `{settings.llm_provider}`  |  Model: `{model}`  |  Cases: {len(cases)}",
        "",
        "## Headline: with vs. without the critic",
        "",
    ]

    modes = list(results.keys())
    summary_rows = []
    for mode in modes:
        s = results[mode]["summary"]
        summary_rows.append([
            mode, s["n"], s["judge_mean"], s["judge_pass_rate"],
            s["exact_fact_rate"], s["routing_accuracy"], s["mean_revisions"], s["mean_seconds"],
        ])

    out.append(markdown_table(
        ["Mode", "N", "Judge mean (1-5)", "Judge pass (>=4)", "Exact-fact rate",
         "Routing accuracy", "Mean revisions", "Mean sec/question"],
        summary_rows,
    ))
    out.append("")

    # ---- RAGAS -----------------------------------------------------------
    ragas_present = any(results[m].get("ragas") for m in modes)
    out.append("## RAGAS metrics")
    out.append("")
    if ragas_present:
        metric_names = sorted({k for m in modes for k in results[m].get("ragas", {})})
        out.append(markdown_table(
            ["Mode", *metric_names],
            [[m, *[results[m].get("ragas", {}).get(k) for k in metric_names]] for m in modes],
        ))
    else:
        out.append("_RAGAS was not run (`--no-ragas`, or the `ragas` package is not installed)._")
    out.append("")

    # ---- per-question ----------------------------------------------------
    for mode in modes:
        out.append(f"## Per-question results - {mode}")
        out.append("")
        out.append(markdown_table(
            ["ID", "Type", "Judge", "Facts", "Routing", "Agents used", "Rev", "Sec"],
            [[r["id"], r["qtype"], f"{r['judge_score']}/5",
              "pass" if r["facts_ok"] else ("n/a" if r["facts_ok"] is None else "FAIL"),
              "ok" if r["routing_ok"] else ("n/a" if r["routing_ok"] is None else "MISROUTE"),
              ", ".join(r["agents_used"]) or "-", r["revisions"], r["seconds"]]
             for r in results[mode]["rows"]],
        ))
        out.append("")

    # ---- failures --------------------------------------------------------
    out.append("## Failures worth reviewing (judge <= 3, or a failed fact check)")
    out.append("")
    any_failure = False
    for mode in modes:
        for r in results[mode]["rows"]:
            if r["judge_score"] <= 3 or r["facts_ok"] is False:
                any_failure = True
                out += [
                    f"### `{r['id']}` ({mode}) - judge {r['judge_score']}/5",
                    f"**Q:** {r['question']}",
                    "",
                    f"**Expected agents:** {r['expected_agents'] or '-'} | **Actually used:** {r['agents_used'] or '-'}",
                    "",
                    f"**Judge:** {r['judge_reason']}",
                    f"**Factual errors:** {r['factual_errors'] or '-'}",
                    "",
                    "```",
                    (r["answer"] or "")[:900],
                    "```",
                    "",
                    f"**Trace:** `{' -> '.join(r['steps'])}`",
                    "",
                ]
    if not any_failure:
        out.append("_None - every case scored 4 or 5 and passed its fact check._")
        out.append("")

    return "\n".join(out)


def print_console_summary(results: Dict[str, Dict[str, Any]]) -> None:
    print(f"\n{'=' * 78}\nSUMMARY\n{'=' * 78}")
    header = f"{'Mode':<16}{'N':>4}{'Judge':>8}{'Pass':>8}{'Facts':>8}{'Routing':>9}{'Revs':>7}{'Sec':>8}"
    print(header)
    print("-" * len(header))
    for mode, payload in results.items():
        s = payload["summary"]
        print(
            f"{mode:<16}{s['n']:>4}{s['judge_mean']:>8}{s['judge_pass_rate']:>8}"
            f"{_fmt(s['exact_fact_rate']):>8}{_fmt(s['routing_accuracy']):>9}"
            f"{s['mean_revisions']:>7}{s['mean_seconds']:>8}"
        )

    for mode, payload in results.items():
        if payload.get("ragas"):
            print(f"\nRAGAS ({mode}):")
            for key, value in sorted(payload["ragas"].items()):
                print(f"  {key:<34} {value}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the multi-agent analyst.")
    parser.add_argument("--quick", action="store_true", help="6-question subset (saves free-tier quota)")
    parser.add_argument("--no-ragas", action="store_true", help="skip RAGAS; judge + exact-fact only")
    parser.add_argument("--mode", choices=["both", "with", "without"], default="both")
    parser.add_argument("--limit", type=int, default=0, help="cap the number of cases")
    args = parser.parse_args()

    settings.require_llm_key()

    cases = quick_subset() if args.quick else list(TEST_SET)
    if args.limit:
        cases = cases[: args.limit]

    modes = {"both": [True, False], "with": [True], "without": [False]}[args.mode]

    results: Dict[str, Dict[str, Any]] = {}
    for enable_critic in modes:
        label = "with critic" if enable_critic else "without critic"
        rows = run_all(cases, enable_critic)
        payload: Dict[str, Any] = {"rows": rows, "summary": summarise(rows)}
        if not args.no_ragas:
            payload["ragas"] = run_ragas(rows)
        results[label] = payload

    print_console_summary(results)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    json_path = RESULTS_DIR / f"eval-{stamp}.json"
    json_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")

    md_path = RESULTS_DIR / f"eval-{stamp}.md"
    report = build_report(results, cases)
    md_path.write_text(report, encoding="utf-8")
    (RESULTS_DIR / "latest.md").write_text(report, encoding="utf-8")

    print(f"\nWrote:\n  {md_path}\n  {json_path}\n  {RESULTS_DIR / 'latest.md'}")
    flush()


if __name__ == "__main__":
    main()
