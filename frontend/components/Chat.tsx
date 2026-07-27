"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, EXAMPLE_QUESTIONS, getHealth, streamAsk } from "@/lib/api";
import type { HealthResponse, NodeName, Turn } from "@/lib/types";
import { StepChips, TraceTimeline } from "./TraceTimeline";
import { EvidenceBlock, Sources } from "./Sources";

function newTurn(question: string): Turn {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    answer: "",
    trace: [],
    steps: [],
    sources: [],
    revisions: 0,
    status: "streaming",
  };
}

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [enableCritic, setEnableCritic] = useState(true);
  const [useMemory, setUseMemory] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;

      setInput("");
      setBusy(true);

      const turn = newTurn(q);
      setTurns((prev) => [...prev, turn]);

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (fn: (t: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === turn.id ? fn(t) : t)));

      try {
        for await (const event of streamAsk(q, {
          enableCritic,
          useMemory,
          signal: controller.signal,
        })) {
          if (event.type === "step") {
            patch((t) => ({
              ...t,
              steps: event.steps ?? t.steps,
              trace: [
                ...t.trace,
                { node: event.node as NodeName, detail: event.detail, at: Date.now() },
              ],
            }));
          } else if (event.type === "final") {
            patch((t) => ({
              ...t,
              answer: event.answer,
              steps: event.steps ?? t.steps,
              sources: event.sources ?? [],
              revisions: event.revisions ?? 0,
              sqlResult: event.sql_result,
              codeResult: event.code_result,
              status: "done",
            }));
          } else if (event.type === "error") {
            patch((t) => ({ ...t, status: "error", error: event.message }));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patch((t) =>
          t.status === "streaming" ? { ...t, status: "error", error: message } : t
        );
      } finally {
        patch((t) => (t.status === "streaming" ? { ...t, status: "done" } : t));
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, enableCritic, useMemory]
  );

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <Header health={health} />

      {turns.length === 0 && <ExamplePicker onPick={send} disabled={busy} />}

      <div className="flex-1 space-y-5">
        {turns.map((turn) => (
          <TurnCard key={turn.id} turn={turn} />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer
        input={input}
        setInput={setInput}
        onSend={() => send(input)}
        onStop={stop}
        busy={busy}
        enableCritic={enableCritic}
        setEnableCritic={setEnableCritic}
        useMemory={useMemory}
        setUseMemory={setUseMemory}
      />
    </div>
  );
}

function Header({ health }: { health: HealthResponse | null }) {
  const ok = health?.llm_ready;
  return (
    <header className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Multi-Agent AI Analyst</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            A supervisor routes each question to specialists — documents, web, SQL, code —
            and a critic verifies the answer before you see it.
          </p>
        </div>
        <div className="mono text-right text-[11px] leading-relaxed text-slate-500">
          <div className="flex items-center justify-end gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                health === null ? "bg-slate-600" : ok ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {health === null ? "backend unreachable" : ok ? "backend ready" : "backend degraded"}
          </div>
          {health && (
            <>
              <div>{health.model}</div>
              <div>
                web {health.capabilities.web_search ? "on" : "off"} · tracing{" "}
                {health.capabilities.tracing ? "on" : "off"} · db{" "}
                {health.capabilities.database ? "on" : "off"}
              </div>
            </>
          )}
          {health === null && <div className="text-slate-600">{API_URL}</div>}
        </div>
      </div>

      {health && !health.llm_ready && health.llm_error && (
        <pre className="mono mt-3 whitespace-pre-wrap rounded-lg border border-amber-900/60 bg-amber-950/30 p-2.5 text-[11px] text-amber-300">
          {health.llm_error}
        </pre>
      )}
    </header>
  );
}

function ExamplePicker({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Try one</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {EXAMPLE_QUESTIONS.map((ex) => (
          <button
            key={ex.text}
            onClick={() => onPick(ex.text)}
            disabled={disabled}
            className="group rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left transition hover:border-slate-600 hover:bg-slate-900 disabled:opacity-50"
          >
            <span className="mono text-[10px] uppercase tracking-wide text-slate-500">
              {ex.label}
            </span>
            <p className="mt-1 text-sm text-slate-300 group-hover:text-white">{ex.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnCard({ turn }: { turn: Turn }) {
  const streaming = turn.status === "streaming";

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-2xl rounded-2xl rounded-br-sm bg-indigo-600/90 px-4 py-2.5 text-sm text-white">
          {turn.question}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="card p-4">
          {turn.status === "error" ? (
            <p className="text-sm text-rose-400">{turn.error || "Something went wrong."}</p>
          ) : turn.answer ? (
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-100">
              {turn.answer}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {streaming ? "Agents are working…" : "No answer."}
            </p>
          )}

          {turn.revisions > 0 && (
            <p className="mt-2 text-xs text-critic">
              Critic forced {turn.revisions} revision{turn.revisions === 1 ? "" : "s"}.
            </p>
          )}

          <EvidenceBlock label="SQL query & result" content={turn.sqlResult} accent="text-data" />
          <EvidenceBlock label="Code & output" content={turn.codeResult} accent="text-code" />
          <Sources sources={turn.sources} />

          {turn.steps.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <StepChips steps={turn.steps} />
            </div>
          )}
        </div>

        <aside className="card h-fit p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Live trace</p>
          <TraceTimeline trace={turn.trace} streaming={streaming} />
        </aside>
      </div>
    </section>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  onStop,
  busy,
  enableCritic,
  setEnableCritic,
  useMemory,
  setUseMemory,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  enableCritic: boolean;
  setEnableCritic: (v: boolean) => void;
  useMemory: boolean;
  setUseMemory: (v: boolean) => void;
}) {
  return (
    <div className="card sticky bottom-4 p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder="Ask about churn, pricing, the SLA, the roadmap…"
          className="flex-1 resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500"
        />
        {busy ? (
          <button
            onClick={onStop}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Ask
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 px-1 text-xs text-slate-500">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={enableCritic}
            onChange={(e) => setEnableCritic(e.target.checked)}
            className="accent-indigo-500"
          />
          Critic (verification gate)
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={useMemory}
            onChange={(e) => setUseMemory(e.target.checked)}
            className="accent-indigo-500"
          />
          Long-term memory
        </label>
      </div>
    </div>
  );
}
