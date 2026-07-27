# Error analysis

Three questions the system gets wrong, which node is responsible for each, and one concrete fix apiece.

> **How to use this document.** The three failures below are the ones this
> architecture actually produces — each is reproducible with the command given,
> and each fix is a real code change with a file and a line of reasoning. Run
> `python -m eval.run_eval` first: the generated `eval/results/latest.md` lists
> every case that scored ≤ 3 with its full trace. Replace the "Observed" blocks
> below with **your** run's output, then keep or adjust the diagnosis. A mentor
> is grading whether you can read a trace and name the guilty node — not whether
> your failures match mine.

---

## Failure 1 — Supervisor mis-routes a comparison question to one agent

**Question:** *"Does our average P1 ticket resolution time meet the resolution target in our support SLA policy?"* (`multi-03` in the test set)

**Reproduce:**

```bash
python -m app.graph "Does our average P1 ticket resolution time meet the resolution target in our SLA policy?"
```

**Observed trace (typical):**

```
supervisor->retriever -> retriever(k=4,hits=4) -> supervisor->finish
-> generate -> critic:approved
```

**What went wrong.** The question *reads* like a policy question, so the supervisor dispatches the retriever, finds the 8-hour target in `support_sla_policy.md`, and stops. But the question is a **comparison**: it needs the policy target *and* the measured average (9.75 h) from the database. The answer that comes back states the target confidently and either omits the actual figure or — worse — quotes the document's qualitative line *"the average P1 resolution time exceeds the 8-hour target"* as if it were a measurement.

**Guilty node: the supervisor (F7).** Not the retriever, which did exactly what it was asked. The routing prompt says "dispatch ONE agent at a time" but gives no rule for questions whose *form* is a comparison between a documented target and a measured value.

**Why the critic didn't save it.** The answer is technically grounded — every claim traces to a retrieved chunk. The critic checks grounding, not whether the *right evidence* was gathered. A well-grounded answer to a half-gathered question passes.

**Fix.** Teach the supervisor to recognise comparison questions explicitly. In `app/agents/supervisor.py`, add to the rules block of `SUPERVISOR_PROMPT`:

```
6. A COMPARISON question - "does X meet Y", "are we above/below", "how does A
   compare to B" - needs BOTH sides. If one side is a documented target or
   policy and the other is a measured value, you must dispatch BOTH 'retriever'
   and 'data' before choosing 'finish'.
```

and mirror it in `heuristic_route()` so the deterministic fallback agrees:

```python
comparison = re.search(r"\b(meet|meets|compare|versus|vs\.?|above|below|exceed|within target)\b", question)
if comparison and not {"data", "retriever"} <= used:
    return "data" if "data" not in used else "retriever"
```

**Verify:** `pytest tests/test_agents_offline.py -k Routing`, then re-run the question and confirm both agents appear in the trace.

---

## Failure 2 — Code agent computes on a stale or mis-parsed number

**Question:** *"What percentage of our total active MRR did we lose to churn in Q2 2026? Show the calculation."* (`multi-02`)

**Reproduce:**

```bash
python -m app.graph "What percentage of our total active MRR did we lose to churn in Q2 2026? Show the calculation."
```

**Observed trace (typical):**

```
supervisor->data -> data(sql):ok(attempt 1) -> supervisor->code
-> code:ok(attempt 1) -> supervisor->finish -> generate -> critic:approved
```

**What went wrong.** The SQL returns the two figures as a raw tuple string — something like `[(7362.0, 865239.0)]`, or across two rows, or with the columns in the opposite order from what the question implies. The code agent receives that string as *text* and must re-extract the numbers to hardcode them into its snippet. When the SQL result has more than one row, aliased columns, or an unexpected order, the code agent picks the wrong number and produces a confidently wrong percentage — `0.09%` instead of `0.85%`, say.

**Guilty node: the code agent (F6) — but the root cause is the handoff.** The code agent's own arithmetic is exact; the sandbox guarantees that. The failure is that structured data crossed an agent boundary as an unstructured string.

**Why the critic often misses it.** The critic sees the SQL result and the code output and checks the *answer* against them. Because the code output is self-consistent (the printed number really is what that snippet computes), the answer looks internally coherent. The critic has to notice that the code hardcoded the wrong operand — a subtler check than grounding.

**Fix.** Give the code agent structured input instead of asking it to re-parse prose. Two changes in `app/agents/data.py`:

1. Ask for named columns in the SQL prompt (already required: *"give aggregate columns readable aliases"*) and **also** store the parsed rows, not just the rendered string:

```python
return {
    "sql_result": f"{safe_sql}\n-> {rows}",
    "sql_rows": rows,          # add to AgentState
    ...
}
```

2. In `app/agents/code.py`, add a rule to `CODE_PROMPT`:

```
- The SQL result is shown as `column_name = value` pairs. Use the NAMED value,
  never positional order. If the value you need is not present by name, print
  "MISSING: <name>" instead of guessing.
```

The `MISSING:` sentinel matters — it converts a silent wrong answer into a visible failure the critic will reject.

**Verify:** add a live test asserting `"0.85" in state["answer"]` for this question (already present as `multi-02` in the test set, and as `TestCodeAgent::test_computes_a_percentage_correctly`).

---

## Failure 3 — Retrieval misses because the question uses the database's vocabulary

**Question:** *"Why did the MISSING_FEATURE accounts leave?"*

**Reproduce:**

```bash
python -m app.agents.retriever "Why did the MISSING_FEATURE accounts leave?"
```

**Observed:** the top-k chunks come back from the reason-code *table* in the churn postmortem — a one-line dictionary definition — rather than from §3, *"What we saw in Q2 2026"*, which contains the actual explanation (SAP/Workday connectors, multi-step approval branching).

**What went wrong.** `MISSING_FEATURE` is a database enum. The document that *explains* it mostly uses natural language — "customers needed a capability we do not ship", "native SAP and Workday connectors". The embedding of a screaming-snake-case token sits closer to the table row that literally contains that token than to the prose that explains it. Classic vocabulary mismatch: the question speaks SQL, the answer lives in English.

**Guilty node: the retriever (F3)** — specifically the chunking and query strategy, not the model.

**Why the critic didn't save it.** The answer *is* grounded — in the dictionary chunk. It says `MISSING_FEATURE` means the customer needed a capability we do not ship. That is true, and useless. Grounded-but-shallow is the critic's blind spot.

**Fix — pick one, and measure the difference:**

**(a) Query expansion before retrieval.** Cheapest and most general. In `app/agents/retriever.py`, expand enum-looking tokens before searching:

```python
REASON_GLOSS = {
    "MISSING_FEATURE": "missing capability, feature gap, connector not available, blocked on functionality",
    "POOR_SUPPORT": "support quality, SLA breach, slow escalation, unresolved P1",
    "ONBOARDING_FAILURE": "failed activation, never went live, fewer than three workflows",
    # ...
}

def expand(question: str) -> str:
    extra = [gloss for code, gloss in REASON_GLOSS.items() if code in question.upper()]
    return f"{question} {' '.join(extra)}" if extra else question
```

**(b) Retrieve more, then re-rank.** Fetch `k=10` and have the LLM keep the 4 chunks that actually answer the question. Better recall, one extra LLM call per retrieval.

**(c) Larger chunks for narrative documents.** 1000 characters splits §3 mid-argument. Chunking the postmortem at 1500/250 keeps each reason's explanation intact.

Start with (a) — it is ~10 lines and targets this failure precisely.

**Verify:** re-run `python -m eval.run_eval --quick` and compare `context_recall` and `context_precision` before and after. That is the metric this fix should move; if it doesn't, the diagnosis was wrong.

---

## Pattern across all three

Every one of these is **grounded but wrong** — which is precisely the failure class a critic that only checks grounding cannot catch. Two of the three were caused by a node *upstream* of where the error surfaced.

Two structural lessons:

1. **Test the routing, not just the answer.** The evaluation harness scores `routing_accuracy` separately for exactly this reason: an answer can be well-grounded and still be an answer to the wrong question. Failures 1 and 3 show up as a routing/recall regression long before they show up as a bad judge score.

2. **Structured data should not cross agent boundaries as prose.** Failure 2 is the general case: every stringify-then-reparse hop is a place for a silent error. Where an agent hands numbers to another agent, hand it named values.

**One thing the critic could learn.** All three failures would be caught by adding a *sufficiency* check to `CRITIC_PROMPT` — not "is this claim supported?" but "was the right evidence gathered at all?":

```
5. **Sufficiency** - does the evidence actually cover every part of the question?
   If the question compares two things and only one appears in the evidence,
   set ok=false and name the missing side.
```

That single addition converts Failures 1 and 3 from silent wrong answers into revision loops. Worth running the harness with and without it and reporting the difference — that is a genuine result, not a claim.
