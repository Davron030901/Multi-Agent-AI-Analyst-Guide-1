"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { ChunkList } from "@/components/chunk-list";
import { CodeResultView } from "@/components/code-result";
import { NodeGraph } from "@/components/node-graph";
import { SqlResultView } from "@/components/sql-result";
import { Tab, TabList, TabPanel, Tabs } from "@/components/primitives";
import { AgentBadge } from "@/components/agent-badge";
import { copy } from "@/lib/copy";
import {
  formatMs,
  formatTokens,
  runTotals,
  type Chunk,
  type CodeResult,
  type Run,
  type SqlResult,
} from "@/lib/events";

export type PanelTab = "evidence" | "sql" | "code" | "trace";

export function EvidencePanel({
  run,
  tab,
  onTabChange,
  showGraph = false,
  highlightSource,
}: {
  run: Run | null;
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  showGraph?: boolean;
  highlightSource?: number | null;
}) {
  const { chunks, sql, code } = useMemo(() => collect(run), [run]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as PanelTab)}>
        <TabList label={copy.panel.title}>
          <Tab value="evidence">
            {copy.panel.tabs.evidence}
            <Count n={chunks.length} />
          </Tab>
          <Tab value="sql">
            {copy.panel.tabs.sql}
            <Count n={sql.length} />
          </Tab>
          <Tab value="code">
            {copy.panel.tabs.code}
            <Count n={code.length} />
          </Tab>
          <Tab value="trace">{copy.panel.tabs.trace}</Tab>
        </TabList>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabPanel value="evidence">
            {chunks.length === 0 ? (
              <Empty>{copy.panel.empty.evidence}</Empty>
            ) : (
              <ChunkList chunks={chunks} highlightId={null} />
            )}
          </TabPanel>

          <TabPanel value="sql">
            {sql.length === 0 ? (
              <Empty>{copy.panel.empty.sql}</Empty>
            ) : (
              <div className="space-y-4">
                {sql.map((r, i) => (
                  <SqlResultView key={i} result={r} />
                ))}
              </div>
            )}
          </TabPanel>

          <TabPanel value="code">
            {code.length === 0 ? (
              <Empty>{copy.panel.empty.code}</Empty>
            ) : (
              <div className="space-y-4">
                {code.map((r, i) => (
                  <CodeResultView key={i} result={r} />
                ))}
              </div>
            )}
          </TabPanel>

          <TabPanel value="trace">
            {run && run.stations.length > 0 ? (
              <TraceTable run={run} />
            ) : (
              <Empty>{copy.panel.empty.trace}</Empty>
            )}
          </TabPanel>

          {showGraph && run && run.stations.length > 0 && (
            <div className="mt-4">
              <NodeGraph run={run} />
            </div>
          )}
        </div>
      </Tabs>

      {highlightSource != null && run && (
        <div
          className="hairline-t px-3 py-2 text-[13px]"
          style={{ background: "var(--surface-2)" }}
          aria-live="polite"
        >
          <span className="label-micro" style={{ color: "var(--text-faint)" }}>
            SOURCE [{highlightSource}]
          </span>{" "}
          <span className="text-[var(--text-muted)]">
            {run.sources.find((s) => s.n === highlightSource)?.title ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="tnum ml-1" style={{ color: "var(--text-faint)" }}>
      {n}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-6 text-[13px] leading-relaxed text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function TraceTable({ run }: { run: Run }) {
  const totals = runTotals(run);
  // Rough public pricing, stated as an estimate rather than a fact.
  const costUsd = (totals.tokens / 1_000_000) * 0.45;

  return (
    <div className="space-y-3">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Step", "Agent", "Time", "Tokens"].map((h) => (
              <th
                key={h}
                scope="col"
                className="label-micro border-b border-[var(--line)] px-1.5 py-1.5 text-left"
                style={{ color: "var(--text-faint)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {run.stations.map((s, i) => (
            <tr key={s.id}>
              <td
                className="tnum border-b border-[var(--line)] px-1.5 py-1.5 font-mono text-[12px]"
                style={{ color: "var(--text-faint)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </td>
              <td className="border-b border-[var(--line)] px-1.5 py-1.5">
                <AgentBadge agent={s.agent} size="xs" />
              </td>
              <td
                className="tnum border-b border-[var(--line)] px-1.5 py-1.5 text-right font-mono text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                {s.ms ? formatMs(s.ms) : s.status === "running" ? "…" : "—"}
              </td>
              <td
                className="tnum border-b border-[var(--line)] px-1.5 py-1.5 text-right font-mono text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                {s.tokens ? formatTokens(s.tokens) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {[
          ["Total time", formatMs(totals.ms)],
          ["Total tokens", formatTokens(totals.tokens)],
          ["Revisions", String(totals.revisions)],
          ["Estimated cost", `$${costUsd.toFixed(4)}`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="label-micro" style={{ color: "var(--text-faint)" }}>
              {k}
            </dt>
            <dd className="tnum font-mono text-[12px] text-[var(--text)]">{v}</dd>
          </div>
        ))}
      </dl>

      <a
        href="https://cloud.langfuse.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[13px] hover:underline"
        style={{ color: "var(--supervisor-on-surface)" }}
      >
        Open this run in Langfuse
        <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
      </a>
    </div>
  );
}

function collect(run: Run | null) {
  const chunks: Chunk[] = [];
  const sql: SqlResult[] = [];
  const code: CodeResult[] = [];

  for (const station of run?.stations ?? []) {
    const e = station.evidence;
    if (!e) continue;
    if (e.kind === "chunks") chunks.push(...e.chunks);
    else if (e.kind === "sql") sql.push(e);
    else if (e.kind === "code") code.push(e);
  }

  // De-duplicate passages: the retriever often returns the same file twice.
  const seen = new Set<string>();
  const unique = chunks.filter((c) => {
    const key = `${c.source}|${c.snippet.slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { chunks: unique, sql, code };
}
