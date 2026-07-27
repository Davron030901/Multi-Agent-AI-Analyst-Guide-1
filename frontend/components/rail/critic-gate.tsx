"use client";

import { motion } from "framer-motion";
import { CornerLeftUp, ShieldCheck, ShieldX } from "lucide-react";
import { copy } from "@/lib/copy";
import type { Gate } from "@/lib/events";

const RAIL_X = 13;

/**
 * The critic is not another station — it is a GATE drawn across the rail.
 *
 * This is the one deliberate interruption in an otherwise quiet interface.
 * Verification is the product's whole claim, so it gets the only moment that
 * physically stops the eye mid-scroll: a horizontal bar cutting the vertical
 * spine. Approved, the bar opens and a thin --ok line lets the answer through.
 * Rejected, it holds, and a return arc loops back up to the supervisor.
 */
export function CriticGate({
  gate,
  pending = false,
}: {
  gate?: Gate;
  pending?: boolean;
}) {
  if (pending) return <PendingGate />;
  if (!gate) return null;

  const ok = gate.ok;
  const hue = ok ? "var(--ok)" : "var(--warn)";
  const hueText = ok ? "var(--ok-on-surface)" : "var(--warn-on-surface)";
  const Icon = ok ? ShieldCheck : ShieldX;

  return (
    <li className="relative list-none">
      {/* The bar across the spine */}
      <div className="relative grid grid-cols-[28px_1fr] gap-x-2">
        <div className="relative flex justify-center">
          <motion.span
            aria-hidden
            className="absolute top-[9px] h-[2px]"
            style={{ left: RAIL_X - 9, background: hue }}
            initial={{ width: 0 }}
            animate={{ width: 20 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <span
            aria-hidden
            className="absolute top-[5px] block h-[10px] w-[10px] rotate-45 border"
            style={{
              left: RAIL_X - 5,
              borderColor: hue,
              background: "var(--canvas)",
            }}
          />
        </div>

        <div className="min-w-0 pb-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <Icon
              size={13}
              strokeWidth={1.75}
              aria-hidden
              className="translate-y-[2px]"
              style={{ color: hueText }}
            />
            <span className="label-micro" style={{ color: hueText }}>
              {ok ? copy.critic.gateOpen : copy.critic.gateClosed}
            </span>
            {!ok && (
              <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                {copy.critic.branch(gate.revision).toUpperCase()}
              </span>
            )}
          </div>

          <p className="mt-1 max-w-[64ch] text-[13px] leading-snug text-[var(--text-muted)]">
            <span style={{ color: "var(--text)" }}>
              {ok ? copy.critic.approved : copy.critic.rejected}:
            </span>{" "}
            {gate.reason}
          </p>

          {/* Rejected: a visible return arc back up to the supervisor. */}
          {!ok && <ReturnArc />}
        </div>
      </div>

      {/* Approved: the gate opens and a thin ok-coloured line continues down,
          unlocking the answer beneath it. */}
      {ok && (
        <motion.span
          aria-hidden
          className="absolute bottom-[-4px] w-[2px]"
          style={{
            left: RAIL_X - 1,
            top: 20,
            background: "var(--ok)",
            transformOrigin: "top",
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
        />
      )}
    </li>
  );
}

/** The loop back to the supervisor, drawn rather than described. */
function ReturnArc() {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <svg
        width="34"
        height="20"
        viewBox="0 0 34 20"
        fill="none"
        aria-hidden
        className="flex-none"
      >
        <motion.path
          d="M32 18 L10 18 Q2 18 2 10 L2 2"
          stroke="var(--warn)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <motion.path
          d="M2 2 L-1 6 M2 2 L5 6"
          stroke="var(--warn)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.36, duration: 0.12 }}
        />
      </svg>
      <span className="label-micro" style={{ color: "var(--warn-on-surface)" }}>
        BACK TO SUPERVISOR
      </span>
      <CornerLeftUp
        size={12}
        strokeWidth={1.75}
        aria-hidden
        style={{ color: "var(--warn-on-surface)" }}
      />
    </div>
  );
}

function PendingGate() {
  return (
    <li className="relative list-none" style={{ ["--agent" as string]: "var(--critic)" }}>
      <div className="grid grid-cols-[28px_1fr] gap-x-2">
        <div className="relative flex justify-center pt-[7px]">
          <span
            className="breathe block h-[8px] w-[8px] rounded-full"
            style={{ background: "var(--critic)" }}
            aria-hidden
          />
        </div>
        <div className="pb-4">
          <span className="label-micro" style={{ color: "var(--critic-on-surface)" }}>
            CRITIC · CHECKING
          </span>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {copy.console.verifying}.
          </p>
        </div>
      </div>
    </li>
  );
}
