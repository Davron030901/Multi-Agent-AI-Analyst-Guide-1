import type { AgentName } from "./agents";
import type {
  AgentEvent,
  Chunk,
  CodeResult,
  EvidencePayload,
  Source,
  SqlResult,
} from "./events";
import { mockStream } from "./mock/stream";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const FORCE_MOCK = process.env.NEXT_PUBLIC_FORCE_MOCK === "true";

/* ===========================================================================
   Live backend → typed contract.

   The backend streams one SSE frame per completed graph node. That is a
   coarser shape than the UI's event contract, so this adapter expands each
   frame into the start/evidence/end triple the rail expects.

   It reads a `payload` field when the backend sends structured evidence, and
   degrades to the raw strings an older build emits — so the console works
   against a deployment that has not been updated yet.
   =========================================================================== */

interface BackendFrame {
  type: "start" | "step" | "final" | "error";
  node?: string;
  detail?: string;
  plan?: string | null;
  steps?: string[];
  ms?: number;
  tokens?: number;
  payload?: unknown;
  question?: string;
  answer?: string;
  sources?: unknown[];
  revisions?: number;
  sql_result?: string | null;
  code_result?: string | null;
  message?: string;
}

const SPECIALIST_NODES: AgentName[] = ["retriever", "web", "data", "code"];

function isAgent(name: string | undefined): name is AgentName {
  return (
    name === "supervisor" ||
    name === "retriever" ||
    name === "web" ||
    name === "data" ||
    name === "code" ||
    name === "critic"
  );
}

/** Split the backend's `"<sql>\n-> <rows>"` into its two halves. */
function splitArrow(raw: string): { head: string; tail: string } {
  const i = raw.indexOf("\n->");
  if (i === -1) return { head: raw.trim(), tail: "" };
  return { head: raw.slice(0, i).trim(), tail: raw.slice(i + 3).trim() };
}

function sqlFromRaw(raw: string): SqlResult {
  const { head, tail } = splitArrow(raw);
  const blocked = /^SQL AGENT FAILED|^DATABASE UNAVAILABLE|Forbidden keyword/i.test(raw);
  return {
    kind: "sql",
    query: head,
    columns: [],
    rows: [],
    rowCount: 0,
    rejected: blocked || undefined,
    rejectionReason: blocked ? raw.slice(0, 400) : undefined,
    // The unparsed result is still worth showing verbatim.
    ...(tail ? { rawTail: tail } : {}),
  } as SqlResult & { rawTail?: string };
}

function codeFromRaw(raw: string): CodeResult {
  const { head, tail } = splitArrow(raw);
  const timedOut = /SANDBOX TIMEOUT/i.test(raw);
  const rejected = /SANDBOX REJECTED/i.test(raw);
  return {
    kind: "code",
    source: head,
    stdout: tail,
    ms: 0,
    failure: timedOut ? "timeout" : rejected ? "rejected" : undefined,
    failureDetail: timedOut || rejected ? tail || raw.slice(0, 300) : undefined,
  };
}

function chunksFromSources(sources: unknown[]): Chunk[] {
  return sources
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .filter((s) => s.type === "document" || s.type === "web")
    .map((s, i) => ({
      id: `c${i}`,
      title: String(s.title ?? s.source ?? "Source"),
      source: String(s.source ?? s.url ?? ""),
      url: typeof s.url === "string" && s.url ? s.url : undefined,
      snippet: String(s.snippet ?? ""),
      // The backend does not score relevance; rank order is the honest proxy,
      // and the UI labels it as such rather than inventing a percentage.
      relevance: Math.max(0.35, 1 - i * 0.12),
    }));
}

function normaliseSources(raw: unknown[]): Source[] {
  const origin = (t: unknown): Source["origin"] =>
    t === "sql" ? "database" : t === "code" ? "computed" : t === "web" ? "web" : "document";

  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s, i) => ({
      n: i + 1,
      title: String(s.title ?? "Source"),
      origin: origin(s.type),
      detail: String(s.snippet ?? s.source ?? ""),
      url: typeof s.url === "string" && s.url ? s.url : undefined,
    }));
}

/** Structured payload sent by an updated backend, if present. */
function payloadFrom(frame: BackendFrame): EvidencePayload | undefined {
  const p = frame.payload as Record<string, unknown> | undefined;
  if (p && typeof p === "object" && typeof p.kind === "string") {
    if (p.kind === "chunks" || p.kind === "sql" || p.kind === "code") {
      return p as unknown as EvidencePayload;
    }
  }
  // Legacy fallbacks.
  if (frame.node === "data" && frame.sql_result) return sqlFromRaw(frame.sql_result);
  if (frame.node === "code" && frame.code_result) return codeFromRaw(frame.code_result);
  return undefined;
}

/** Read approved / rejected out of a backend step label. */
function criticFromSteps(steps: string[] | undefined): { ok: boolean; reason: string } | null {
  const last = steps?.[steps.length - 1];
  if (!last || !last.startsWith("critic:")) return null;
  const ok = last.startsWith("critic:approved");
  const dash = last.indexOf(" - ");
  return { ok, reason: dash >= 0 ? last.slice(dash + 3) : ok ? "Approved." : "Sent back for revision." };
}

/** Expand one backend frame into zero or more typed events. */
export function adaptFrame(frame: BackendFrame, stepNo: number): AgentEvent[] {
  const out: AgentEvent[] = [];

  if (frame.type === "error") {
    out.push({ type: "error", agent: "supervisor", message: frame.message ?? "The run stopped." });
    return out;
  }

  if (frame.type === "final") {
    if (frame.answer) {
      out.push({
        type: "answer",
        text: frame.answer,
        sources: normaliseSources(frame.sources ?? []),
      });
    }
    return out;
  }

  if (frame.type !== "step") return out;

  // The generate node carries the drafted answer. Emitting it here rather than
  // waiting for `final` is what lets the UI show the draft, then the critic
  // verifying it — the same ordering the recorded run uses. On a rejection the
  // next draft simply replaces this one.
  if (frame.node === "generate") {
    const draft = frame.answer ?? frame.detail;
    if (draft) {
      out.push({
        type: "answer",
        text: draft,
        sources: normaliseSources(frame.sources ?? []),
      });
    }
    return out;
  }

  if (!isAgent(frame.node)) return out;

  const node = frame.node;

  if (node === "supervisor") {
    const next = (frame.plan ?? "finish") as AgentName | "finish";
    out.push({ type: "plan", next, reason: frame.detail ?? "" });
    return out;
  }

  if (node === "critic") {
    const verdict = criticFromSteps(frame.steps);
    out.push({
      type: "critic",
      ok: verdict?.ok ?? true,
      reason: verdict?.reason ?? frame.detail ?? "",
      revision: frame.revisions ?? 0,
    });
    return out;
  }

  if (SPECIALIST_NODES.includes(node)) {
    out.push({ type: "step_start", agent: node, step: stepNo });

    const payload = payloadFrom(frame);
    if (payload) out.push({ type: "evidence", agent: node, payload });

    // The backend records a skip or an error inside the step label.
    const last = frame.steps?.[frame.steps.length - 1] ?? "";
    if (/:skipped|:error|:failed|db-unavailable/.test(last)) {
      out.push({
        type: "error",
        agent: node,
        message: frame.detail || last,
        hint:
          node === "web"
            ? "Add a Tavily key in Keys to switch web search on."
            : undefined,
      });
    } else {
      out.push({
        type: "step_end",
        agent: node,
        ms: frame.ms ?? 0,
        tokens: frame.tokens ?? 0,
      });
    }
  }

  return out;
}

/* ===========================================================================
   Transport
   =========================================================================== */

export interface StreamOptions {
  enableCritic?: boolean;
  useMemory?: boolean;
  signal?: AbortSignal;
  /** Called when the live backend is unavailable and the mock takes over. */
  onFallback?: () => void;
}

export async function checkHealth(): Promise<{
  ok: boolean;
  model?: string;
  capabilities?: Record<string, unknown>;
} | null> {
  if (!API_URL || FORCE_MOCK) return null;
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return { ok: Boolean(body.llm_ready), model: body.model, capabilities: body.capabilities };
  } catch {
    return null;
  }
}

/**
 * Ask a question and yield typed events.
 * Falls back to the recorded run whenever a live backend is not usable, so
 * every screen and state stays reachable with no server.
 */
export async function* ask(
  question: string,
  options: StreamOptions = {},
): AsyncGenerator<AgentEvent> {
  const { signal, enableCritic = true, useMemory = true, onFallback } = options;

  if (!API_URL || FORCE_MOCK) {
    yield* mockStream(question, { signal });
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        enable_critic: enableCritic,
        use_memory: useMemory,
      }),
      signal,
    });
  } catch {
    onFallback?.();
    yield* mockStream(question, { signal });
    return;
  }

  if (!response.ok || !response.body) {
    onFallback?.();
    yield* mockStream(question, { signal });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stepNo = 1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;

          let parsed: BackendFrame;
          try {
            parsed = JSON.parse(raw) as BackendFrame;
          } catch {
            continue; // partial frame — wait for the rest
          }

          stepNo += 1;
          for (const event of adaptFrame(parsed, stepNo)) {
            yield event;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
