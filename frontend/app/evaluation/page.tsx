"use client";

import { FailureTable, MetricsTable } from "@/components/metrics-table";
import { SiteHeader } from "@/components/site-header";
import { copy } from "@/lib/copy";

export default function EvaluationPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />

      <main
        id="main"
        className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-10 sm:px-6"
      >
        <header>
          <p className="label-micro" style={{ color: "var(--critic-on-surface)" }}>
            RAGAS · LLM JUDGE · EXACT-FACT CHECK
          </p>
          <h1 className="font-display-tight mt-2 text-[clamp(24px,5vw,30px)] leading-tight">
            {copy.evaluation.title}
          </h1>
          <p className="measure mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
            {copy.evaluation.sub}
          </p>
        </header>

        <div className="mt-10">
          <MetricsTable />
        </div>

        <FailureTable />

        <p
          className="mt-12 border-t border-[var(--line)] pt-4 text-[13px] leading-snug"
          style={{ color: "var(--text-faint)" }}
        >
          Numbers on this page are fixtures. Replace them from{" "}
          <code className="font-mono">backend/eval/results/latest.md</code> after
          running <code className="font-mono">python -m eval.run_eval</code> — the
          fixture shape in <code className="font-mono">lib/evaluation.ts</code>{" "}
          mirrors that output.
        </p>
      </main>
    </div>
  );
}
