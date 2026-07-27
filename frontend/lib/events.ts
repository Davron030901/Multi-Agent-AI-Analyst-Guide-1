import type { AgentName } from "./agents";

/* ===========================================================================
   The event contract.
   Everything the UI renders is derived from this union — there is no other
   source of truth. The mock stream and the live backend both produce it, so
   any screen can be exercised without a server.
   =========================================================================== */

/** One retrieved passage. Called a "source" in the UI, never a "chunk". */
export interface Chunk {
  id: string;
  title: string;
  source: string;
  url?: string;
  snippet: string;
  /** 0–1. Rendered as a bar, and always with the number beside it. */
  relevance: number;
}

export interface SqlResult {
  kind: "sql";
  query: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  /** True when the read-only guard rejected a generated query. */
  rejected?: boolean;
  rejectionReason?: string;
}

export interface CodeChartSeries {
  label: string;
  value: number;
  /** Optional per-bar hue variable, e.g. "var(--data)". */
  hue?: string;
}

export interface CodeResult {
  kind: "code";
  source: string;
  stdout: string;
  ms: number;
  chart?: {
    title: string;
    unit?: string;
    series: CodeChartSeries[];
  };
  /** Set when the sandbox refused or killed the snippet. */
  failure?: "timeout" | "rejected" | "error";
  failureDetail?: string;
}

export interface ChunkList {
  kind: "chunks";
  chunks: Chunk[];
}

export type EvidencePayload = ChunkList | SqlResult | CodeResult;

export interface Source {
  n: number;
  title: string;
  origin: "document" | "web" | "database" | "computed";
  detail: string;
  url?: string;
}

export type AgentEvent =
  | { type: "plan"; next: AgentName | "finish"; reason: string }
  | { type: "step_start"; agent: AgentName; step: number }
  | { type: "token"; agent: AgentName; text: string }
  | { type: "evidence"; agent: AgentName; payload: EvidencePayload }
  | { type: "step_end"; agent: AgentName; ms: number; tokens: number }
  | { type: "critic"; ok: boolean; reason: string; revision: number }
  | { type: "answer"; text: string; sources: Source[] }
  | { type: "error"; agent: AgentName; message: string; hint?: string };

/* ===========================================================================
   Derived view model
   =========================================================================== */

export type StationStatus = "running" | "done" | "error";

export interface Station {
  id: string;
  agent: AgentName;
  step: number;
  status: StationStatus;
  /** Supervisor stations carry the routing decision; specialists carry a summary. */
  detail?: string;
  ms?: number;
  tokens?: number;
  evidence?: EvidencePayload;
  error?: { message: string; hint?: string };
  /** Which revision branch this station belongs to. 0 = first pass. */
  revision: number;
}

export interface Gate {
  id: string;
  ok: boolean;
  reason: string;
  revision: number;
}

export type RunStatus = "idle" | "streaming" | "done" | "error";

export interface Run {
  id: string;
  question: string;
  status: RunStatus;
  stations: Station[];
  gates: Gate[];
  answer: string;
  sources: Source[];
  revision: number;
  /** Which agent is on the rail right now — drives the "who is working" copy. */
  activeAgent: AgentName | null;
  stepBudget: { used: number; max: number };
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export const STEP_BUDGET_MAX = 15;

export function emptyRun(question: string): Run {
  return {
    id: `run_${Date.now().toString(36)}`,
    question,
    status: "idle",
    stations: [],
    gates: [],
    answer: "",
    sources: [],
    revision: 0,
    activeAgent: null,
    stepBudget: { used: 0, max: STEP_BUDGET_MAX },
    startedAt: Date.now(),
  };
}

/* ---------------------------------------------------------------------------
   Reducer. Pure, so it can be unit tested and replayed.
   --------------------------------------------------------------------------- */
export function reduceRun(run: Run, event: AgentEvent): Run {
  switch (event.type) {
    case "plan": {
      const station: Station = {
        id: `${run.id}_s${run.stations.length}`,
        agent: "supervisor",
        step: run.stepBudget.used + 1,
        status: "done",
        detail: event.reason,
        revision: run.revision,
      };
      return {
        ...run,
        status: "streaming",
        stations: [...run.stations, station],
        activeAgent: event.next === "finish" ? null : event.next,
        stepBudget: { ...run.stepBudget, used: run.stepBudget.used + 1 },
      };
    }

    case "step_start": {
      const station: Station = {
        id: `${run.id}_s${run.stations.length}`,
        agent: event.agent,
        step: event.step,
        status: "running",
        revision: run.revision,
      };
      return {
        ...run,
        status: "streaming",
        stations: [...run.stations, station],
        activeAgent: event.agent,
        stepBudget: { ...run.stepBudget, used: Math.max(run.stepBudget.used, event.step) },
      };
    }

    case "token": {
      const stations = [...run.stations];
      const i = lastIndexOf(stations, event.agent, "running");
      if (i >= 0) {
        const s = stations[i]!;
        stations[i] = { ...s, detail: `${s.detail ?? ""}${event.text}` };
      }
      return { ...run, stations };
    }

    case "evidence": {
      const stations = [...run.stations];
      const i = lastIndexOf(stations, event.agent, "running");
      if (i >= 0) stations[i] = { ...stations[i]!, evidence: event.payload };
      return { ...run, stations };
    }

    case "step_end": {
      const stations = [...run.stations];
      const i = lastIndexOf(stations, event.agent, "running");
      if (i >= 0) {
        stations[i] = {
          ...stations[i]!,
          status: "done",
          ms: event.ms,
          tokens: event.tokens,
        };
      }
      return { ...run, stations, activeAgent: null };
    }

    case "critic": {
      const gate: Gate = {
        id: `${run.id}_g${run.gates.length}`,
        ok: event.ok,
        reason: event.reason,
        revision: event.revision,
      };
      return {
        ...run,
        gates: [...run.gates, gate],
        // A rejection opens a new branch on the rail.
        revision: event.ok ? run.revision : event.revision,
        activeAgent: null,
        stepBudget: { ...run.stepBudget, used: run.stepBudget.used + 1 },
      };
    }

    case "answer":
      return {
        ...run,
        answer: event.text,
        sources: event.sources,
        activeAgent: null,
      };

    case "error": {
      const stations = [...run.stations];
      const i = lastIndexOf(stations, event.agent, "running");
      if (i >= 0) {
        stations[i] = {
          ...stations[i]!,
          status: "error",
          error: { message: event.message, hint: event.hint },
        };
        return { ...run, stations, activeAgent: null };
      }
      return { ...run, status: "error", error: event.message, activeAgent: null };
    }

    default:
      return run;
  }
}

function lastIndexOf(
  stations: Station[],
  agent: AgentName,
  status: StationStatus,
): number {
  for (let i = stations.length - 1; i >= 0; i--) {
    const s = stations[i];
    if (s && s.agent === agent && s.status === status) return i;
  }
  return -1;
}

/* ---------------------------------------------------------------------------
   Summaries used by the answer-card footer and the trace tab.
   --------------------------------------------------------------------------- */
export interface RunTotals {
  agents: number;
  steps: number;
  revisions: number;
  ms: number;
  tokens: number;
}

export function runTotals(run: Run): RunTotals {
  const agents = new Set(run.stations.filter((s) => s.agent !== "supervisor").map((s) => s.agent));
  const ms = run.stations.reduce((a, s) => a + (s.ms ?? 0), 0);
  const tokens = run.stations.reduce((a, s) => a + (s.tokens ?? 0), 0);
  return {
    agents: agents.size,
    steps: run.stations.length,
    revisions: run.gates.filter((g) => !g.ok).length,
    ms: ms || (run.endedAt ? run.endedAt - run.startedAt : 0),
    tokens,
  };
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}
