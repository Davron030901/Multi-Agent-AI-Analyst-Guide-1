"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { AgentDot } from "@/components/agent-badge";
import { ChunkList } from "@/components/chunk-list";
import { CodeResultView } from "@/components/code-result";
import { SqlResultView } from "@/components/sql-result";
import { agentMeta, agentVars } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { formatMs, formatTokens, type Station } from "@/lib/events";

const RAIL_X = 13;

export function StationRow({
  station,
  isLast,
  prevAgent,
  defaultOpen = false,
  onOpenPanel,
}: {
  station: Station;
  isLast: boolean;
  prevAgent?: string;
  defaultOpen?: boolean;
  onOpenPanel?: (station: Station) => void;
}) {
  const meta = agentMeta(station.agent);
  const hasBody = Boolean(station.evidence || station.error || station.detail);
  const [open, setOpen] = useState(defaultOpen);

  const running = station.status === "running";
  const errored = station.status === "error";

  const label = prevAgent
    ? `${prevAgent.toUpperCase()} → ${meta.code}`
    : meta.code;

  return (
    <li className="relative" style={agentVars(station.agent)}>
      {/* Segment above this station. Solid once the step is done; a travelling
          pulse while it runs. This is the one orchestrated moment. */}
      {!isLast && <Segment status={station.status} />}

      <div className="relative grid grid-cols-[28px_1fr] gap-x-2">
        <div className="relative flex justify-center pt-[7px]">
          <AgentDot
            agent={station.agent}
            state={errored ? "error" : running ? "running" : "done"}
          />
        </div>

        <div className="min-w-0 pb-5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <button
              type="button"
              onClick={() => {
                if (!hasBody) return;
                setOpen((v) => !v);
                if (!open) onOpenPanel?.(station);
              }}
              disabled={!hasBody}
              aria-expanded={hasBody ? open : undefined}
              aria-label={
                hasBody
                  ? open
                    ? copy.a11y.stationCollapse(meta.name)
                    : copy.a11y.stationExpand(meta.name)
                  : undefined
              }
              className="group -ml-1 inline-flex min-h-[24px] items-center gap-1.5 rounded-[4px] px-1 disabled:cursor-default"
            >
              {hasBody && (
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  aria-hidden
                  className="transition-transform duration-[var(--dur-state)]"
                  style={{
                    color: "var(--text-faint)",
                    transform: open ? "rotate(90deg)" : "none",
                  }}
                />
              )}
              <span className="label-micro" style={{ color: "var(--agent-text)" }}>
                {label}
              </span>
            </button>

            {/* Status is stated in words, not only by the dot's colour. */}
            {running && (
              <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                RUNNING
              </span>
            )}
            {errored && (
              <span className="label-micro" style={{ color: "var(--error-on-surface)" }}>
                FAILED
              </span>
            )}
            {station.ms !== undefined && station.ms > 0 && (
              <span
                className="tnum label-micro"
                style={{ color: "var(--text-faint)" }}
              >
                {formatMs(station.ms)}
              </span>
            )}
            {station.tokens !== undefined && station.tokens > 0 && (
              <span
                className="tnum label-micro"
                style={{ color: "var(--text-faint)" }}
              >
                {formatTokens(station.tokens)} TOK
              </span>
            )}
          </div>

          {station.detail && (
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
              {station.detail}
            </p>
          )}

          {/* Reserve the body's vertical space only when it is open, and animate
              height — content arriving never shoves the answer down. */}
          <AnimatePresence initial={false}>
            {open && hasBody && (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2.5">
                  <StationBody station={station} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* An error is always visible, never hidden behind a disclosure. */}
          {station.error && !open && (
            <ErrorNote message={station.error.message} hint={station.error.hint} />
          )}
        </div>
      </div>
    </li>
  );
}

function StationBody({ station }: { station: Station }) {
  return (
    <div className="space-y-2.5">
      {station.error && (
        <ErrorNote message={station.error.message} hint={station.error.hint} />
      )}
      {station.evidence?.kind === "chunks" && (
        <ChunkList chunks={station.evidence.chunks} />
      )}
      {station.evidence?.kind === "sql" && (
        <SqlResultView result={station.evidence} dense />
      )}
      {station.evidence?.kind === "code" && (
        <CodeResultView result={station.evidence} />
      )}
    </div>
  );
}

function ErrorNote({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      className="mt-2 flex items-start gap-2 rounded-[6px] border px-2.5 py-2"
      style={{ borderColor: "var(--error)" }}
      role="status"
    >
      <TriangleAlert
        size={13}
        strokeWidth={1.75}
        aria-hidden
        className="mt-[3px] flex-none"
        style={{ color: "var(--error-on-surface)" }}
      />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--text)]">{message}</p>
        {hint && (
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">{hint}</p>
        )}
      </div>
    </div>
  );
}

/** The rail segment. Idle hairline underneath, agent colour drawn over it. */
function Segment({ status }: { status: Station["status"] }) {
  const running = status === "running";
  return (
    <span
      aria-hidden
      className="absolute top-[15px] bottom-[-6px] w-[2px]"
      style={{ left: RAIL_X - 1, background: "var(--rail-idle)" }}
    >
      <motion.span
        className="absolute inset-0 origin-top"
        style={{
          background: status === "error" ? "var(--error)" : "var(--agent)",
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{
          duration: running ? 0.42 : 0.22,
          ease: [0.2, 0.8, 0.2, 1],
        }}
      />
    </span>
  );
}
