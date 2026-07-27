"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";

const KIND_STYLE: Record<string, string> = {
  document: "border-retriever/50 text-retriever",
  web: "border-web/50 text-web",
  sql: "border-data/50 text-data",
  code: "border-code/50 text-code",
};

export function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  // De-duplicate: retrieval often returns several chunks of the same file.
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const key = `${s.type}|${s.title}|${s.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
      >
        {open ? "Hide" : "Show"} {unique.length} source{unique.length === 1 ? "" : "s"}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {unique.map((s, i) => (
            <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`mono rounded border px-1.5 py-0.5 text-[10px] uppercase ${
                    KIND_STYLE[s.type] ?? "border-slate-700 text-slate-400"
                  }`}
                >
                  {s.type}
                </span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs text-slate-300 hover:text-white hover:underline"
                  >
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className="truncate text-xs text-slate-300">
                    {s.title || s.source || "source"}
                  </span>
                )}
              </div>
              {s.snippet && (
                <p className="mono mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                  {s.snippet}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EvidenceBlock({
  label,
  content,
  accent,
}: {
  label: string;
  content?: string | null;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  if (!content) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`mono text-[11px] ${accent} underline-offset-2 hover:underline`}
      >
        {open ? "▾" : "▸"} {label}
      </button>
      {open && (
        <pre className="mono mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-[11px] leading-relaxed text-slate-400">
          {content}
        </pre>
      )}
    </div>
  );
}
