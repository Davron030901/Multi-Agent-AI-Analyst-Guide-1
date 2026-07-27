# Error analysis

Three failures observed on the **live deployment** (Render, `gpt-4o-mini` chat +
Gemini embeddings), the exact node responsible for each, and the fix applied.

All three came from a single question:

> *"How many customers churned in Q2 2026, and why did they leave?"*

The answer was **numerically correct** — 12 churns, correct reason-code
breakdown. It also took **23 graph steps**, burned the entire revision budget,
called the code agent five times, and never once used a company document. A
right answer produced by a broken process.

Full trace as observed:

```
supervisor->data      data(sql):ok(attempt 1)
supervisor->retriever retriever(k=4,hits=0)          ← failure 1
supervisor->finish    generate
critic:rejected(1/2) - "the total is incorrectly stated as 12;
                        the correct total is 12..."   ← failure 2
supervisor->finish    generate(revision 1)
critic:rejected(2/2) - (identical text)               ← failure 2
supervisor->code      code:ok(attempt 1)              ┐
supervisor->code      code:ok(attempt 1)              │
supervisor->code      code:ok(attempt 1)              ├ failure 3
supervisor->code      code:ok(attempt 1)              │
supervisor->code      code:ok(attempt 1)              ┘
supervisor->finish(step budget)                       ← only the rail stopped it
generate(revision 2)  critic:approved
```

---

## Failure 1 — Retriever returned 0 chunks, so the "why" was never answered

**Node:** retriever (F3) — but the root cause is upstream of the code.

**Observed:** `retriever(k=4,hits=0)`. Zero chunks, on a question whose entire
second half ("and why did they leave?") depends on the churn postmortem.

**What the user got.** The answer listed reason *codes* — `MISSING_FEATURE: 4`,
`POOR_SUPPORT: 3` — because those come from the SQL `reason_code` column. It
never explained what those codes *mean*: that `MISSING_FEATURE` was native
SAP/Workday connectors and multi-step approval branching, or that
`POOR_SUPPORT` was escalation latency rather than slow first response. All of
that is in `churn_postmortem_q2_2026.md` and none of it reached the model.

**The same question, harder evidence.** A second question, *"What meaning this
project"*, routed to the retriever, got 0 hits, fell through to web search, and
returned a **generic dictionary definition of the word "project"** — "a
temporary endeavor aimed at achieving specific goals within defined
constraints". Confident, fluent, and completely unrelated to Northwind Cloud.
That is what an empty vector store looks like from the outside: not an error,
just quietly wrong answers.

**Cause.** The Qdrant Cloud collection was empty. The database ships inside the
Docker image (deterministic, no API key needed), but embedding requires a key
that only exists at runtime — so ingestion is a separate, easily-forgotten step.
`/health` reported `"status": "ok"` throughout, because the process *was*
healthy. It just had nothing to retrieve.

**Fix — two parts.**

1. Ingest into the deployed vector store. From your machine, with `QDRANT_URL`
   and `QDRANT_API_KEY` in `.env`:

   ```bash
   cd backend && python -m ingestion.ingest --reset
   ```

2. **Make the failure visible instead of silent.** A new `/diagnostics`
   endpoint reports vector count, embedding provider and a single
   `ready_to_answer` boolean, with a `fix` field naming the exact command when
   it is false. `/health` says the process is up; `/diagnostics` says the system
   can actually answer.

**Why the critic didn't catch it.** The critic checks whether claims are
*grounded in the evidence present*. It has no way to know that evidence which
should have been gathered is missing. This is the blind spot all three failures
share.

---

## Failure 2 — The critic rejected an answer for being correct

**Node:** critic (F8).

**Observed, twice, verbatim:**

> *"The total number of churned customers is incorrectly stated as 12; the
> correct total is 12 based on the breakdown provided."*

The critic asserts 12 is wrong, then states the correct value is 12. It is
arguing with itself. It burned both revisions on a defect that does not exist,
and its "objection" is what sent the supervisor hunting for more evidence —
directly causing Failure 3.

**Cause.** `gpt-4o-mini` is a small model, and `CRITIC_PROMPT` instructs it to
be strict. Under pressure to find a problem, it manufactured one and never
checked its own output for coherence. This is a known small-model failure mode:
instruction-following without self-consistency.

**Fix — prompt plus a deterministic guard, because a prompt alone is not a
guarantee.**

1. A self-check added to `CRITIC_PROMPT`:

   > If you are about to say a figure is wrong, write down the value YOU believe
   > is correct and compare it to the value in the answer. **If they are
   > identical, the answer is correct: set ok=true.**

2. A **stuck-critic guard** in `critic()`. If the rejection reason is identical
   to the previous one, the loop is not converging — the supervisor already
   tried to close that gap and the evidence did not change. Accept, and record
   why:

   ```
   critic:approved(repeat complaint, not converging) - <reason>
   ```

   Regression-tested in `TestStuckCriticRegression`: an identical complaint
   breaks the loop and does **not** consume more budget; a genuinely new
   complaint still rejects normally.

**Also worth doing:** the critic is the one node where model quality pays for
itself. `OPENAI_MODEL=gpt-4o`, or Gemini for the whole run, removes most of this
class of error. The guards above make the system robust to a weak critic; they
do not make a weak critic good.

---

## Failure 3 — The supervisor dispatched the code agent five times

**Node:** supervisor (F7). **This was a bug in the routing rails, not the LLM.**

**Observed:** five consecutive `supervisor->code` → `code:ok(attempt 1)` pairs,
each generating byte-identical Python:

```python
churn_data = [('MISSING_FEATURE', 4), ('POOR_SUPPORT', 3), ('PRICE', 2),
              ('ONBOARDING_FAILURE', 2), ('MERGER', 1)]
total_churned = sum(count for reason, count in churn_data)
```

The supervisor's own reason each time: *"To confirm the total number of churned
customers by explicitly showing the addition of individual counts."* It had
already confirmed it. Four times.

Only the step budget stopped it — `supervisor->finish(step budget)`. Termination
held, but ten wasted steps and five API calls is not "working".

**Cause — a real hole in my guard.** The anti-re-dispatch rail read:

```python
if nxt in SPECIALISTS and nxt in used and state.get("revisions", 0) == 0:
```

That `revisions == 0` condition means the guard **switched itself off the moment
the critic rejected anything** — precisely when a confused supervisor is most
likely to loop. The guard was absent exactly when it was needed.

**Fix.** An absolute per-agent cap, independent of revision state:

```python
MAX_AGENT_RUNS = 2   # one normal run + one retry if the critic asks for something

runs = _agent_run_counts(steps)
if nxt in SPECIALISTS:
    already = runs.get(nxt, 0)
    if already >= MAX_AGENT_RUNS:
        nxt = "finish"                       # absolute cap
    elif already >= 1 and revisions == 0:
        nxt = "finish"                       # no retry without a pending revision
```

Regression-tested in `TestRedispatchLoopRegression`, including the exact live
condition (`revisions = 2`, `code` already run twice → must route to `finish`),
plus the inverse: a legitimate second run **is** still allowed when a revision
is pending.

---

## Pattern across all three

**Every failure was grounded but wrong, and two were caused by a node upstream
of where the symptom appeared.**

1. **The critic's blind spot is sufficiency, not grounding.** It verifies that
   claims match the evidence present. It cannot see evidence that should have
   been gathered and wasn't. Failure 1 sailed through untouched.

2. **A rail with a condition on it is not a rail.** The `revisions == 0` clause
   turned a safety guarantee into a suggestion, and disabled it in exactly the
   state where it mattered. Termination guarantees must be unconditional — the
   step budget was, which is the only reason the run ended.

3. **Silent degradation is the expensive kind.** An empty vector store produced
   no errors, no warnings, and a healthy `/health`. It produced *plausible
   answers*, which is far worse than a crash — you have to already suspect the
   problem to find it. Hence `/diagnostics`.

### The one change that would have caught two of three

Adding a **sufficiency** check to `CRITIC_PROMPT` — asking not "is this claim
supported?" but "was the right evidence gathered at all?":

```
5. **Sufficiency** - does the evidence actually cover every part of the question?
   A "how many and why" question needs BOTH a count from the database AND an
   explanation from the documents. If the documents returned nothing, say so and
   set ok=false - do not let reason CODES stand in for reasons.
```

This turns Failure 1 from a silently thin answer into a visible revision loop.
Worth running `python -m eval.run_eval` with and without it and reporting the
difference in `context_recall` — that is a measured result, not a claim.

---

## Reproducing these

```bash
# Failure 1 - is the vector store actually populated?
curl -s https://YOUR-SERVICE.onrender.com/diagnostics | python -m json.tool

# Failures 2 and 3 - regression tests, offline, no API key
cd backend
pytest tests/test_agents_offline.py -k "Regression" -v
```
