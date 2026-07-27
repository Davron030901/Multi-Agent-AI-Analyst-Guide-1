"use client";

import { AgentBadge } from "@/components/agent-badge";
import { copy } from "@/lib/copy";
import {
  CULPRIT_AGENT,
  FAILURES,
  METRICS,
  RUN_META,
  type Metric,
} from "@/lib/evaluation";

/**
 * Paired bars, one row per metric.
 *
 * The brief says the delta is the story, so the delta is the only element on
 * the row rendered in display type at 22px — the bars themselves are quiet
 * 6px rules. Reading down the right-hand column tells you what the critic buys
 * you, without decoding two bar lengths per row.
 */
export function MetricsTable() {
  return (
    <section aria-labelledby="metrics-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="metrics-heading" className="font-display-tight text-[22px]">
          {copy.evaluation.metricsTitle}
        </h2>
        <p className="label-micro" style={{ color: "var(--text-faint)" }}>
          {RUN_META.questions} QUESTIONS · {RUN_META.breakdown.toUpperCase()} ·{" "}
          {RUN_META.model.toUpperCase()}
        </p>
      </div>

      <Legend />

      <ul className="mt-4 space-y-px overflow-hidden rounded-[10px] border border-[var(--line)]">
        {METRICS.map((m) => (
          <li
            key={m.id}
            className="px-3.5 py-3.5 sm:px-4"
            style={{ background: "var(--surface)", boxShadow: "0 0 0 1px var(--line)" }}
          >
            <MetricRow metric={m} />
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[13px] leading-snug text-[var(--text-muted)]">
        Median time per question: {RUN_META.medianLatencyWith}s with the critic,{" "}
        {RUN_META.medianLatencyWithout}s without. Verification costs roughly four
        seconds and a second pass — that is the price of the deltas above.
      </p>
    </section>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block h-[6px] w-6 rounded-[2px]"
          style={{ background: "var(--ok)" }}
        />
        <span className="label-micro" style={{ color: "var(--text-muted)" }}>
          {copy.evaluation.withCritic}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block h-[6px] w-6 rounded-[2px]"
          style={{
            background:
              "repeating-linear-gradient(90deg, var(--text-faint) 0 3px, transparent 3px 6px)",
          }}
        />
        <span className="label-micro" style={{ color: "var(--text-muted)" }}>
          {copy.evaluation.withoutCritic}
        </span>
      </span>
    </div>
  );
}

function MetricRow({ metric }: { metric: Metric }) {
  const { withCritic, withoutCritic, scale } = metric;
  const delta = withCritic - withoutCritic;
  const pctWith = (withCritic / scale) * 100;
  const pctWithout = (withoutCritic / scale) * 100;
  const improved = delta > 0;

  const fmt = (v: number) => (scale === 5 ? v.toFixed(1) : v.toFixed(2));
  const fmtDelta = scale === 5 ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}`;
  const deltaUnit = scale === 5 ? "" : "pp";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 sm:grid-cols-[minmax(0,1fr)_96px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-[15px] font-medium text-[var(--text)]">{metric.label}</h3>
          <span className="label-micro" style={{ color: "var(--text-faint)" }}>
            {scale === 5 ? "1–5" : "0–1"}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">
          {metric.help}
        </p>

        {/* Paired bars. Values are always printed, never bar-length only. */}
        <div className="mt-2.5 space-y-1.5">
          <Bar
            label={copy.evaluation.withCritic}
            value={fmt(withCritic)}
            pct={pctWith}
            fill="var(--ok)"
          />
          <Bar
            label={copy.evaluation.withoutCritic}
            value={fmt(withoutCritic)}
            pct={pctWithout}
            fill="var(--text-faint)"
            dashed
          />
        </div>
      </div>

      {/* The delta: the loudest thing on the row. */}
      <div className="text-right">
        <p className="label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.evaluation.deltaLabel}
        </p>
        <p
          className="tnum font-display-tight text-[22px] leading-none"
          style={{ color: improved ? "var(--ok-on-surface)" : "var(--error-on-surface)" }}
        >
          {fmtDelta}
          {deltaUnit && (
            <span className="ml-0.5 align-top text-[11px]">{deltaUnit}</span>
          )}
        </p>
        <p className="label-micro mt-1" style={{ color: "var(--text-faint)" }}>
          {improved ? "BETTER" : "WORSE"}
        </p>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  fill,
  dashed = false,
}: {
  label: string;
  value: string;
  pct: number;
  fill: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="label-micro w-[92px] flex-none truncate"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </span>
      <div
        className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-[2px]"
        style={{ background: "var(--surface-2)" }}
        aria-hidden
      >
        <div
          className="h-full rounded-[2px]"
          style={{
            width: `${pct}%`,
            background: dashed
              ? `repeating-linear-gradient(90deg, ${fill} 0 3px, transparent 3px 6px)`
              : fill,
            transition: "width var(--dur-state) var(--ease)",
          }}
        />
      </div>
      <span className="tnum w-[38px] flex-none text-right font-mono text-[12px] text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- failures --- */

export function FailureTable() {
  return (
    <section aria-labelledby="failures-heading" className="mt-12">
      <h2 id="failures-heading" className="font-display-tight text-[22px]">
        {copy.evaluation.failuresTitle}
      </h2>
      <p className="measure mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">
        {copy.evaluation.failuresSub}
      </p>

      {/* A table at ≥768px; the same rows as cards below that, because a
          five-column table on a 360px screen is a horizontal scroll. */}
      <div className="mt-5 hidden overflow-hidden rounded-[10px] border border-[var(--line)] md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              {[
                copy.evaluation.columns.question,
                copy.evaluation.columns.culprit,
                copy.evaluation.columns.what,
                copy.evaluation.columns.fix,
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="label-micro border-b border-[var(--line)] px-3 py-2"
                  style={{ color: "var(--text-faint)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAILURES.map((f) => (
              <tr key={f.id} style={{ background: "var(--surface)" }}>
                <td
                  className="border-b border-[var(--line)] px-3 py-3 align-top"
                  style={{ width: "22%" }}
                >
                  <span className="label-micro block" style={{ color: "var(--text-faint)" }}>
                    {f.id}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-[var(--text)]">
                    {f.question}
                  </span>
                </td>
                <td
                  className="border-b border-[var(--line)] px-3 py-3 align-top"
                  style={{ width: "16%" }}
                >
                  <AgentBadge agent={CULPRIT_AGENT[f.culprit]} size="xs" />
                  <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
                    {f.culprit}
                  </span>
                </td>
                <td className="border-b border-[var(--line)] px-3 py-3 align-top text-[13px] leading-snug text-[var(--text-muted)]">
                  {f.what}
                </td>
                <td
                  className="border-b border-[var(--line)] px-3 py-3 align-top text-[13px] leading-snug"
                  style={{ width: "26%", color: "var(--text)" }}
                >
                  {f.fix}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 space-y-2 md:hidden">
        {FAILURES.map((f) => (
          <li
            key={f.id}
            className="panel px-3.5 py-3"
            style={{ borderLeftWidth: 2, borderLeftColor: "var(--error)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                {f.id}
              </span>
              <AgentBadge agent={CULPRIT_AGENT[f.culprit]} size="xs" />
            </div>
            <p className="mt-1 text-[14px] leading-snug text-[var(--text)]">{f.question}</p>
            <p className="mt-2 text-[13px] leading-snug text-[var(--text-muted)]">{f.what}</p>
            <p className="mt-2 text-[13px] leading-snug text-[var(--text)]">
              <span className="label-micro" style={{ color: "var(--ok-on-surface)" }}>
                FIX
              </span>{" "}
              {f.fix}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
