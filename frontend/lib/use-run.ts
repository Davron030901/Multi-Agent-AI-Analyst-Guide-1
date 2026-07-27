"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, Run } from "./events";
import { emptyRun, reduceRun } from "./events";
import { ask } from "./client";

export interface UseRunResult {
  runs: Run[];
  current: Run | null;
  busy: boolean;
  usingMock: boolean;
  start: (question: string) => void;
  stop: () => void;
  reset: () => void;
  replay: (events: AgentEvent[]) => void;
}

export interface UseRunOptions {
  enableCritic?: boolean;
  useMemory?: boolean;
}

export function useRun(options: UseRunOptions = {}): UseRunResult {
  const { enableCritic = true, useMemory = true } = options;

  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = useCallback((fn: (run: Run) => Run) => {
    setRuns((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]!);
      return next;
    });
  }, []);

  const start = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || busy) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setUsingMock(false);

      const seed: Run = { ...emptyRun(q), status: "streaming" };
      setRuns((prev) => [...prev, seed]);

      void (async () => {
        try {
          for await (const event of ask(q, {
            enableCritic,
            useMemory,
            signal: controller.signal,
            onFallback: () => setUsingMock(true),
          })) {
            if (controller.signal.aborted) break;
            patchLast((run) => reduceRun(run, event));
          }
          patchLast((run) => ({
            ...run,
            status: run.status === "error" ? "error" : "done",
            activeAgent: null,
            endedAt: Date.now(),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          patchLast((run) => ({
            ...run,
            status: "error",
            error: message,
            activeAgent: null,
            endedAt: Date.now(),
          }));
        } finally {
          setBusy(false);
          abortRef.current = null;
        }
      })();
    },
    [busy, enableCritic, useMemory, patchLast],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    patchLast((run) =>
      run.status === "streaming"
        ? { ...run, status: "done", activeAgent: null, endedAt: Date.now() }
        : run,
    );
  }, [patchLast]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setRuns([]);
  }, []);

  /** Apply a recorded event list at once — used by tests and the hero. */
  const replay = useCallback((events: AgentEvent[]) => {
    setRuns((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1]!;
      next[next.length - 1] = events.reduce(reduceRun, last);
      return next;
    });
  }, []);

  const current = useMemo(() => runs[runs.length - 1] ?? null, [runs]);

  return { runs, current, busy, usingMock, start, stop, reset, replay };
}

/* ---------------------------------------------------------------------------
   A looping replay, for the landing hero. Kept separate from useRun because it
   never touches the network and must restart cleanly.
   --------------------------------------------------------------------------- */
export function useReplay(
  question: string,
  stream: (signal?: AbortSignal) => AsyncGenerator<AgentEvent>,
  { loop = true, pauseMs = 2600 }: { loop?: boolean; pauseMs?: number } = {},
): Run {
  const [run, setRun] = useState<Run>(() => emptyRun(question));

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    async function cycle() {
      while (!cancelled) {
        setRun({ ...emptyRun(question), status: "streaming" });

        if (reduced) {
          // No animation: assemble the finished state in one pass.
          const events: AgentEvent[] = [];
          for await (const e of stream(controller.signal)) events.push(e);
          if (cancelled) return;
          setRun((r) => ({
            ...events.reduce(reduceRun, r),
            status: "done",
            endedAt: Date.now(),
          }));
          return; // a static end state; nothing to loop
        }

        for await (const event of stream(controller.signal)) {
          if (cancelled) return;
          setRun((r) => reduceRun(r, event));
        }
        if (cancelled) return;
        setRun((r) => ({ ...r, status: "done", activeAgent: null, endedAt: Date.now() }));

        if (!loop) return;
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }

    void cycle();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [question, stream, loop, pauseMs]);

  return run;
}
