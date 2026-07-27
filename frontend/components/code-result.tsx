"use client";

import { TimerOff, ShieldAlert } from "lucide-react";
import { highlight } from "@/lib/highlight";
import { copy } from "@/lib/copy";
import type { CodeResult } from "@/lib/events";

export function CodeResultView({ result }: { result: CodeResult }) {
  const failed = Boolean(result.failure);
  const FailIcon = result.failure === "timeout" ? TimerOff : ShieldAlert;

  return (
    <div className="space-y-2.5">
      {failed && (
        <div
          className="flex items-start gap-2 rounded-[6px] border px-2.5 py-2"
          style={{ borderColor: "var(--error)" }}
        >
          <FailIcon
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 flex-none"
            style={{ color: "var(--error-on-surface)" }}
          />
          <div className="min-w-0">
            <p className="label-micro" style={{ color: "var(--error-on-surface)" }}>
              {result.failure === "timeout"
                ? "STOPPED AT THE TIME LIMIT"
                : "REJECTED BY THE SANDBOX"}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
              {result.failureDetail ?? copy.errors.codeTimeout.body}
            </p>
          </div>
        </div>
      )}

      <figure className="overflow-hidden rounded-[6px] border border-[var(--line)]">
        <figcaption
          className="label-micro flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5"
          style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
        >
          <span>PYTHON</span>
          <span style={{ color: "var(--code-on-surface)" }}>SANDBOXED · 15S CAP</span>
        </figcaption>
        <pre
          className="overflow-x-auto px-2.5 py-2 font-mono text-[12px] leading-[1.65]"
          style={{ background: "var(--surface)", tabSize: 4 }}
        >
          <code>{highlight(result.source, "python")}</code>
        </pre>
      </figure>

      {result.stdout && (
        <figure className="overflow-hidden rounded-[6px] border border-[var(--line)]">
          <figcaption
            className="label-micro flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5"
            style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
          >
            <span>{copy.panel.stdout.toUpperCase()}</span>
            {result.ms > 0 && <span className="tnum">{result.ms}MS</span>}
          </figcaption>
          <pre
            className="overflow-x-auto px-2.5 py-2 font-mono text-[12px] leading-[1.65]"
            style={{ background: "var(--surface)", color: "var(--text)" }}
          >
            {result.stdout}
          </pre>
        </figure>
      )}

      {result.chart && <BarChart chart={result.chart} />}
    </div>
  );
}

/**
 * Hand-drawn SVG bars rather than a charting library.
 * A chart with five categories does not justify recharts, and hand-drawing it
 * means the bars use the same hues and the same 1px hairlines as everything
 * else instead of a library's default theme.
 */
function BarChart({ chart }: { chart: NonNullable<CodeResult["chart"]> }) {
  const max = Math.max(...chart.series.map((s) => s.value), 1);

  return (
    <figure className="overflow-hidden rounded-[6px] border border-[var(--line)]">
      <figcaption
        className="label-micro flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5"
        style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
      >
        <span>CHART</span>
        {chart.unit && <span>{chart.unit}</span>}
      </figcaption>

      <div className="space-y-2 px-2.5 py-3">
        <p className="text-[13px] text-[var(--text-muted)]">{chart.title}</p>
        <ul className="space-y-1.5">
          {chart.series.map((s) => {
            const pct = (s.value / max) * 100;
            return (
              <li key={s.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="label-micro truncate"
                      style={{ color: "var(--text-muted)" }}
                      title={s.label}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-[6px] w-full overflow-hidden rounded-[2px]"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full rounded-[2px]"
                      style={{
                        width: `${pct}%`,
                        background: s.hue ?? "var(--code)",
                        transition: "width var(--dur-state) var(--ease)",
                      }}
                    />
                  </div>
                </div>
                <span className="tnum font-mono text-[12px] text-[var(--text)]">
                  {s.value.toLocaleString("en-US")}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}
