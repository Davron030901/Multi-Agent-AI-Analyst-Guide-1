"use client";

import { useEffect, useRef } from "react";
import { AgentDot } from "@/components/agent-badge";
import { agentMeta, agentVars } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { formatMs, type Run, type Station } from "@/lib/events";

/**
 * Under 640px the rail turns on its side: a horizontal, scrollable status
 * strip pinned under the header. The active agent is shown large and named;
 * every other step collapses to a dot. Same data, a tenth of the height.
 */
export function RailStrip({
  run,
  onSelect,
}: {
  run: Run;
  onSelect?: (station: Station) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const activeIndex = run.stations.findIndex((s) => s.status === "running");

  // Keep the running step in view without hijacking a user's manual scroll.
  useEffect(() => {
    if (activeIndex < 0 || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex]);

  if (run.stations.length === 0) return null;

  const active = run.activeAgent ? agentMeta(run.activeAgent) : null;
  const lastGate = run.gates[run.gates.length - 1];

  return (
    <div
      className="border-b border-[var(--line)]"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-2">
        <span className="label-micro" style={{ color: "var(--text-faint)" }}>
          {active
            ? copy.console.working(active.name)
            : lastGate
              ? lastGate.ok
                ? copy.critic.approved
                : copy.console.revisionRunning(lastGate.revision + 1)
              : copy.console.routing}
        </span>
        <span className="tnum label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.console.stepBudget(
            Math.min(run.stepBudget.used, run.stepBudget.max),
            run.stepBudget.max,
          )}
        </span>
      </div>

      <div
        ref={scroller}
        className="no-scrollbar flex items-center gap-1 overflow-x-auto px-4 pb-2.5 pt-2"
      >
        {run.stations.map((station, i) => {
          const meta = agentMeta(station.agent);
          const isActive = station.status === "running";
          const errored = station.status === "error";

          return (
            <button
              key={station.id}
              data-i={i}
              type="button"
              onClick={() => onSelect?.(station)}
              className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-[6px] px-2"
              style={{
                ...agentVars(station.agent),
                border: `1px solid ${isActive || errored ? "var(--agent)" : "transparent"}`,
                borderLeftWidth: 2,
                borderLeftColor: errored ? "var(--error)" : "var(--agent)",
              }}
              aria-label={`${meta.name}, step ${station.step}, ${
                errored ? "failed" : isActive ? "running" : "done"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              <AgentDot
                agent={station.agent}
                state={errored ? "error" : isActive ? "running" : "done"}
                size={isActive ? 9 : 7}
              />
              {/* Only the active step spends horizontal budget on a label. */}
              {isActive && (
                <span className="label-micro" style={{ color: "var(--agent-text)" }}>
                  {meta.code}
                </span>
              )}
              {!isActive && station.ms ? (
                <span
                  className="tnum label-micro"
                  style={{ color: "var(--text-faint)", fontSize: 10 }}
                >
                  {formatMs(station.ms)}
                </span>
              ) : null}
            </button>
          );
        })}

        {lastGate && (
          <span
            className="flex min-h-[44px] flex-none items-center gap-1.5 px-2"
            aria-label={lastGate.ok ? copy.critic.approved : copy.critic.rejected}
          >
            <span
              aria-hidden
              className="block h-[9px] w-[9px] rotate-45 border"
              style={{
                borderColor: lastGate.ok ? "var(--ok)" : "var(--warn)",
                background: "var(--surface)",
              }}
            />
            <span
              className="label-micro"
              style={{
                color: lastGate.ok ? "var(--ok-on-surface)" : "var(--warn-on-surface)",
              }}
            >
              {lastGate.ok ? "OK" : `REV ${lastGate.revision}`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
