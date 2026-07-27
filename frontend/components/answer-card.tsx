"use client";

import { Fragment, useState } from "react";
import {
  Check,
  Copy as CopyIcon,
  Download,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { Button, StatusPill } from "@/components/primitives";
import { copy } from "@/lib/copy";
import {
  formatMs,
  formatTokens,
  runTotals,
  type Run,
  type Source,
} from "@/lib/events";

const ORIGIN_HUE: Record<Source["origin"], string> = {
  document: "var(--retriever-on-surface)",
  web: "var(--web-on-surface)",
  database: "var(--data-on-surface)",
  computed: "var(--code-on-surface)",
};

export function AnswerCard({
  run,
  onCite,
  onJumpToRail,
  onRerun,
}: {
  run: Run;
  onCite?: (n: number | null) => void;
  onJumpToRail?: () => void;
  onRerun?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const totals = runTotals(run);
  const lastGate = run.gates[run.gates.length - 1];
  const verified = lastGate?.ok === true;
  const revisions = totals.revisions;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(run.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the button simply does not confirm */
    }
  }

  function handleExport() {
    const lines = [
      `# ${run.question}`,
      "",
      run.answer,
      "",
      "## Sources",
      ...run.sources.map((s) => `${s.n}. ${s.title} — ${s.detail}`),
      "",
      `${totals.agents} agents · ${totals.steps} steps · ${revisions} revisions · ${formatMs(totals.ms)} · ${formatTokens(totals.tokens)} tokens`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "answer.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article
      className="panel overflow-hidden"
      style={{
        // The verdict is carried by a 2px left rail, matching the agent system.
        borderLeft: `2px solid ${verified ? "var(--ok)" : "var(--warn)"}`,
      }}
      aria-label={verified ? copy.answer.verified : copy.answer.unverified}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3.5">
        <StatusPill tone={verified ? "ok" : "warn"}>
          {verified ? (
            <ShieldCheck size={11} strokeWidth={2} aria-hidden />
          ) : (
            <ShieldAlert size={11} strokeWidth={2} aria-hidden />
          )}
          {verified ? copy.answer.verified : copy.answer.unverified}
        </StatusPill>

        {revisions > 0 && (
          <StatusPill tone="warn">{copy.answer.revised(revisions)}</StatusPill>
        )}
      </header>

      {lastGate && (
        <p className="mt-2 px-4 text-[13px] leading-snug text-[var(--text-muted)]">
          <span className="label-micro" style={{ color: "var(--critic-on-surface)" }}>
            {copy.answer.criticSaid}
          </span>{" "}
          {lastGate.reason}
        </p>
      )}

      <div className="measure px-4 py-3.5 text-[15px] leading-[1.62] text-[var(--text)]">
        <AnswerBody text={run.answer} onCite={onCite} />
      </div>

      {run.sources.length > 0 && (
        <section className="px-4 pb-3">
          <h3 className="label-micro mb-1.5" style={{ color: "var(--text-faint)" }}>
            {copy.answer.sourcesTitle}
          </h3>
          <ol className="space-y-1">
            {run.sources.map((s) => (
              <li
                key={s.n}
                onMouseEnter={() => onCite?.(s.n)}
                onMouseLeave={() => onCite?.(null)}
                className="flex items-baseline gap-2 text-[13px]"
              >
                <span
                  className="tnum label-micro flex-none"
                  style={{ color: ORIGIN_HUE[s.origin] }}
                >
                  [{s.n}]
                </span>
                <span className="min-w-0">
                  <span className="text-[var(--text)]">{s.title}</span>
                  <span className="text-[var(--text-muted)]"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="hairline-t flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <p
          className="tnum label-micro"
          style={{ color: "var(--text-faint)" }}
          aria-label={`${totals.agents} agents, ${totals.steps} steps, ${revisions} revisions, ${formatMs(totals.ms)}, ${formatTokens(totals.tokens)} tokens`}
        >
          {totals.agents} AGENTS · {totals.steps} STEPS · {revisions}{" "}
          {revisions === 1 ? "REVISION" : "REVISIONS"} · {formatMs(totals.ms)} ·{" "}
          {formatTokens(totals.tokens)} TOKENS
        </p>

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onJumpToRail}>
            <Waypoints size={13} strokeWidth={1.75} aria-hidden />
            {copy.console.jumpToRail}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check size={13} strokeWidth={2} aria-hidden style={{ color: "var(--ok-on-surface)" }} />
            ) : (
              <CopyIcon size={13} strokeWidth={1.75} aria-hidden />
            )}
            {copied ? copy.answer.copied : copy.answer.copy}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download size={13} strokeWidth={1.75} aria-hidden />
            {copy.answer.export}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRerun}>
            <RotateCw size={13} strokeWidth={1.75} aria-hidden />
            {copy.answer.rerun}
          </Button>
        </div>
      </footer>
    </article>
  );
}

/**
 * Renders [1] [2] markers as hoverable citations that light up the matching
 * evidence in the right panel. Parsing is a plain split — no HTML injection.
 */
function AnswerBody({
  text,
  onCite,
}: {
  text: string;
  onCite?: (n: number | null) => void;
}) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={pi > 0 ? "mt-3" : undefined}>
          {para.split(/(\[\d+\])/g).map((part, i) => {
            const match = /^\[(\d+)\]$/.exec(part);
            if (!match) return <Fragment key={i}>{part}</Fragment>;
            const n = Number(match[1]);
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => onCite?.(n)}
                onMouseLeave={() => onCite?.(null)}
                onFocus={() => onCite?.(n)}
                onBlur={() => onCite?.(null)}
                className="tnum mx-[1px] rounded-[3px] border px-[3px] align-baseline font-mono text-[11px] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
                aria-label={`Source ${n}`}
              >
                {n}
              </button>
            );
          })}
        </p>
      ))}
    </>
  );
}
