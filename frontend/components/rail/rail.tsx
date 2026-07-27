"use client";

import { Fragment } from "react";
import { agentMeta } from "@/lib/agents";
import { copy } from "@/lib/copy";
import type { Run, Station } from "@/lib/events";
import { StationRow } from "./station";
import { CriticGate } from "./critic-gate";

/**
 * The Rail — a vertical spine down the left of the answer column, with one
 * station per agent step and the critic drawn as a gate across it.
 *
 * Accessibility: the whole rail is an aria-live region, so a screen reader
 * announces each handoff as it happens rather than only at the end.
 */
export function Rail({
  run,
  onOpenPanel,
}: {
  run: Run;
  onOpenPanel?: (station: Station) => void;
}) {
  const streaming = run.status === "streaming";
  // The gate for the current revision only appears once the critic has spoken.
  const gatesByRevision = new Map(run.gates.map((g) => [g.revision, g]));
  const criticPending =
    streaming && Boolean(run.answer) && run.gates.length < run.revision + 1;

  return (
    <section
      aria-label={copy.console.railAria}
      className="relative"
      style={{ contain: "layout" }}
    >
      <RailHeader run={run} />

      <ol
        className="relative mt-3"
        aria-live="polite"
        aria-busy={streaming}
        aria-relevant="additions text"
      >
        {run.stations.map((station, i) => {
          const prev = run.stations[i - 1];
          const isLastOverall = i === run.stations.length - 1 && !criticPending;

          // A revision boundary: render the gate that caused it, then continue.
          const gateBefore =
            prev && station.revision > prev.revision
              ? gatesByRevision.get(prev.revision)
              : undefined;

          return (
            <Fragment key={station.id}>
              {gateBefore && <CriticGate gate={gateBefore} />}
              {station.revision > (prev?.revision ?? 0) && (
                <BranchMarker revision={station.revision} />
              )}
              <StationRow
                station={station}
                isLast={isLastOverall}
                prevAgent={
                  prev && prev.agent !== station.agent && prev.agent === "supervisor"
                    ? agentMeta(prev.agent).code
                    : undefined
                }
                onOpenPanel={onOpenPanel}
              />
            </Fragment>
          );
        })}

        {criticPending && <CriticGate pending />}

        {/* The final verdict sits at the bottom of the rail. */}
        {!criticPending &&
          run.gates.length > 0 &&
          (() => {
            const last = run.gates[run.gates.length - 1]!;
            const alreadyRendered = run.stations.some((s) => s.revision > last.revision);
            return alreadyRendered ? null : <CriticGate gate={last} />;
          })()}
      </ol>
    </section>
  );
}

/** Step budget + who is working. Both reserve their space so nothing shifts. */
function RailHeader({ run }: { run: Run }) {
  const active = run.activeAgent ? agentMeta(run.activeAgent) : null;
  const { used, max } = run.stepBudget;
  const pct = Math.min(100, (used / max) * 100);
  const streaming = run.status === "streaming";

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-h-[20px] items-center gap-2">
        <span className="label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.console.railLabel}
        </span>
        {streaming && (
          <>
            <span aria-hidden style={{ color: "var(--text-faint)" }}>
              ·
            </span>
            <span
              className="label-micro"
              style={{
                color: run.activeAgent
                  ? agentMeta(run.activeAgent).hueOnSurface
                  : "var(--supervisor-on-surface)",
              }}
            >
              {active ? copy.console.working(active.name) : copy.console.routing}
            </span>
          </>
        )}
      </div>

      {/* Step budget: the user can see the graph is bounded. */}
      <div className="flex items-center gap-2" title={copy.console.stepBudgetHelp}>
        <span className="tnum label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.console.stepBudget(Math.min(used, max), max)}
        </span>
        <div
          className="h-[3px] w-16 overflow-hidden rounded-[2px]"
          style={{ background: "var(--surface-2)" }}
          role="progressbar"
          aria-valuenow={Math.min(used, max)}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={copy.console.stepBudgetHelp}
        >
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: pct > 80 ? "var(--warn)" : "var(--supervisor)",
              transition: "width var(--dur-state) var(--ease)",
            }}
          />
        </div>
      </div>
    </header>
  );
}

/** A labelled branch head, so a second pass is legible as a new branch. */
function BranchMarker({ revision }: { revision: number }) {
  return (
    <li className="relative list-none">
      <div className="grid grid-cols-[28px_1fr] gap-x-2">
        <div className="relative flex justify-center">
          <span
            aria-hidden
            className="absolute top-0 h-[14px] w-[2px]"
            style={{
              left: 12,
              background:
                "repeating-linear-gradient(to bottom, var(--warn) 0 3px, transparent 3px 6px)",
            }}
          />
        </div>
        <div className="pb-2">
          <span className="label-micro" style={{ color: "var(--warn-on-surface)" }}>
            {copy.critic.branch(revision).toUpperCase()} · NEW BRANCH
          </span>
        </div>
      </div>
    </li>
  );
}
