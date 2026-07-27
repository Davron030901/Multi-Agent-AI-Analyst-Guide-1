"use client";

import type { NodeName, TraceEntry } from "@/lib/types";

const NODE_META: Record<
  NodeName,
  { label: string; dot: string; text: string; ring: string }
> = {
  supervisor: { label: "SUPERVISOR", dot: "bg-supervisor", text: "text-supervisor", ring: "ring-supervisor/40" },
  retriever: { label: "RETRIEVER", dot: "bg-retriever", text: "text-retriever", ring: "ring-retriever/40" },
  web: { label: "WEB", dot: "bg-web", text: "text-web", ring: "ring-web/40" },
  data: { label: "DATA · SQL", dot: "bg-data", text: "text-data", ring: "ring-data/40" },
  code: { label: "CODE", dot: "bg-code", text: "text-code", ring: "ring-code/40" },
  generate: { label: "GENERATE", dot: "bg-generate", text: "text-generate", ring: "ring-generate/40" },
  critic: { label: "CRITIC", dot: "bg-critic", text: "text-critic", ring: "ring-critic/40" },
};

function meta(node: NodeName) {
  return NODE_META[node] ?? NODE_META.generate;
}

export function TraceTimeline({
  trace,
  streaming,
}: {
  trace: TraceEntry[];
  streaming: boolean;
}) {
  if (trace.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {streaming ? "Waiting for the supervisor…" : "No steps yet."}
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute left-[6px] top-2 h-[calc(100%-1rem)] w-px bg-slate-800" aria-hidden />
      {trace.map((entry, i) => {
        const m = meta(entry.node);
        const isLast = i === trace.length - 1;
        const live = streaming && isLast;
        return (
          <li key={`${entry.node}-${entry.at}-${i}`} className="relative">
            <span
              className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full ring-4 ${m.dot} ${m.ring} ${
                live ? "animate-pulseRing" : ""
              }`}
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`mono text-[11px] font-semibold tracking-wide ${m.text}`}>
                {m.label}
              </span>
              {live && <span className="text-[10px] uppercase text-slate-500">running</span>}
            </div>
            {entry.detail && (
              <p className="mono mt-0.5 break-words text-xs leading-relaxed text-slate-400">
                {entry.detail}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function StepChips({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((step, i) => {
        const node = step.split(/[(:>-]/)[0].trim() as NodeName;
        const m = meta(node);
        return (
          <span
            key={`${step}-${i}`}
            className={`mono rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] ${m.text}`}
            title={step}
          >
            {step.length > 42 ? `${step.slice(0, 42)}…` : step}
          </span>
        );
      })}
    </div>
  );
}
