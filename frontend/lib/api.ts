import type { HealthResponse, StreamEvent } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/**
 * POST to /ask/stream and yield each SSE event as it arrives.
 *
 * We use fetch + ReadableStream rather than EventSource because EventSource is
 * GET-only, and we want the question in a body rather than a URL. The backend
 * exposes a GET variant too, for curl.
 */
export async function* streamAsk(
  question: string,
  opts: { enableCritic?: boolean; useMemory?: boolean; signal?: AbortSignal } = {}
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_URL}/ask/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      enable_critic: opts.enableCritic ?? true,
      use_memory: opts.useMemory ?? true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep the status-code message */
    }
    yield { type: "error", message: detail };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as StreamEvent;
        } catch {
          // A partial frame: ignore it rather than killing the stream.
        }
      }
    }
  }
}

export const EXAMPLE_QUESTIONS = [
  {
    label: "Multi-hop: SQL + documents",
    text: "How many customers churned in Q2 2026, and why did they leave?",
  },
  {
    label: "Multi-hop: SQL + code",
    text: "What percentage of our total active MRR did we lose to churn in Q2 2026? Show the calculation.",
  },
  {
    label: "Multi-hop: data vs. policy",
    text: "Does our average P1 ticket resolution time meet the resolution target in our support SLA policy?",
  },
  {
    label: "Documents only",
    text: "What are our churn reason codes, and what does each one mean?",
  },
  {
    label: "SQL only",
    text: "Give me the breakdown of Q2 2026 churn by reason code.",
  },
  {
    label: "Web only",
    text: "What is LangGraph, and which company maintains it?",
  },
];
