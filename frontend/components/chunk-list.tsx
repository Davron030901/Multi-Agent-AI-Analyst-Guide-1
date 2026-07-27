"use client";

import { ExternalLink, FileText, Globe } from "lucide-react";
import { copy } from "@/lib/copy";
import type { Chunk } from "@/lib/events";

export function ChunkList({
  chunks,
  onHover,
  highlightId,
}: {
  chunks: Chunk[];
  onHover?: (id: string | null) => void;
  highlightId?: string | null;
}) {
  if (chunks.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
        {copy.errors.retrievalEmpty.body}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {chunks.map((chunk) => {
        const isWeb = Boolean(chunk.url);
        const Icon = isWeb ? Globe : FileText;
        const hue = isWeb ? "var(--web)" : "var(--retriever)";
        const hueText = isWeb ? "var(--web-on-surface)" : "var(--retriever-on-surface)";
        const active = highlightId === chunk.id;

        return (
          <li
            key={chunk.id}
            onMouseEnter={() => onHover?.(chunk.id)}
            onMouseLeave={() => onHover?.(null)}
            className="rounded-[6px] border px-2.5 py-2 transition-colors duration-[var(--dur-hover)]"
            style={{
              borderColor: active ? hue : "var(--line)",
              borderLeft: `2px solid ${hue}`,
              background: active ? "var(--surface-2)" : "transparent",
            }}
          >
            <div className="flex items-start gap-2">
              <Icon
                size={13}
                strokeWidth={1.75}
                aria-hidden
                className="mt-[3px] flex-none"
                style={{ color: hueText }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text)]">
                  {chunk.title}
                </p>

                <p className="label-micro mt-0.5 truncate" style={{ color: "var(--text-faint)" }}>
                  {chunk.source}
                </p>

                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {chunk.snippet}
                </p>

                {/* Relevance is shown as a bar AND as a number — never colour alone. */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                    {copy.panel.relevance}
                  </span>
                  <div
                    className="h-[3px] w-16 overflow-hidden rounded-[2px]"
                    style={{ background: "var(--surface-2)" }}
                    aria-hidden
                  >
                    <div
                      className="h-full"
                      style={{ width: `${chunk.relevance * 100}%`, background: hue }}
                    />
                  </div>
                  <span className="tnum font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {chunk.relevance.toFixed(2)}
                  </span>

                  {chunk.url && (
                    <a
                      href={chunk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-[12px] hover:underline"
                      style={{ color: hueText }}
                    >
                      Open
                      <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
