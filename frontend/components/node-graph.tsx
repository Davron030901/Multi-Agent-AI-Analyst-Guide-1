"use client";

import { motion } from "framer-motion";
import { agentMeta, type AgentName } from "@/lib/agents";
import { copy } from "@/lib/copy";
import type { Run } from "@/lib/events";

/**
 * The same run, read as a topology instead of a sequence.
 *
 * Shown only at ≥1280px, where there is room for two readings of one state.
 * The rail answers "what happened, in what order"; this answers "which paths
 * exist, and which one is live right now".
 */

const W = 300;
const H = 210;

const NODES: Record<AgentName, { x: number; y: number }> = {
  supervisor: { x: 150, y: 88 },
  retriever: { x: 44, y: 30 },
  web: { x: 256, y: 30 },
  data: { x: 44, y: 146 },
  code: { x: 256, y: 146 },
  critic: { x: 150, y: 186 },
};

const SPOKES: AgentName[] = ["retriever", "web", "data", "code"];

export function NodeGraph({ run }: { run: Run }) {
  const used = new Set(run.stations.map((s) => s.agent));
  const active = run.activeAgent;
  const lastGate = run.gates[run.gates.length - 1];
  const criticReached = run.gates.length > 0 || Boolean(run.answer);

  return (
    <figure className="panel p-3">
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.panel.graphTitle}
        </span>
        <span className="label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.panel.graphCaption}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Agent graph. ${
          active ? `${agentMeta(active).name} is active.` : "No agent is active."
        }`}
      >
        {/* Spokes: supervisor ↔ specialist */}
        {SPOKES.map((agent) => {
          const n = NODES[agent];
          const s = NODES.supervisor;
          const isUsed = used.has(agent);
          const isActive = active === agent;
          return (
            <g key={agent}>
              <line
                x1={s.x}
                y1={s.y}
                x2={n.x}
                y2={n.y}
                stroke="var(--rail-idle)"
                strokeWidth={1}
              />
              {isUsed && (
                <motion.line
                  x1={s.x}
                  y1={s.y}
                  x2={n.x}
                  y2={n.y}
                  stroke={agentMeta(agent).hue}
                  strokeWidth={isActive ? 2 : 1.25}
                  strokeDasharray={isActive ? "3 3" : undefined}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: isActive ? 1 : 0.7 }}
                  transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
                />
              )}
            </g>
          );
        })}

        {/* Supervisor → critic */}
        <line
          x1={NODES.supervisor.x}
          y1={NODES.supervisor.y}
          x2={NODES.critic.x}
          y2={NODES.critic.y}
          stroke="var(--rail-idle)"
          strokeWidth={1}
        />
        {criticReached && (
          <motion.line
            x1={NODES.supervisor.x}
            y1={NODES.supervisor.y}
            x2={NODES.critic.x}
            y2={NODES.critic.y}
            stroke={lastGate?.ok === false ? "var(--warn)" : "var(--critic)"}
            strokeWidth={1.5}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}

        {/* Rejection: the return edge critic → supervisor */}
        {lastGate?.ok === false && (
          <motion.path
            d={`M ${NODES.critic.x + 14} ${NODES.critic.y - 4}
                Q ${W - 14} ${H / 2} ${NODES.supervisor.x + 16} ${NODES.supervisor.y + 6}`}
            fill="none"
            stroke="var(--warn)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}

        {/* Nodes */}
        {(Object.keys(NODES) as AgentName[]).map((agent) => {
          const n = NODES[agent];
          const meta = agentMeta(agent);
          const isUsed = used.has(agent) || (agent === "critic" && criticReached);
          const isActive = active === agent;
          const r = agent === "supervisor" ? 15 : 12;

          return (
            <g key={agent}>
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill="var(--surface)"
                stroke={isUsed ? meta.hue : "var(--rail-idle)"}
                strokeWidth={isActive ? 2 : 1}
              />
              {isActive && (
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill="none"
                  stroke={meta.hue}
                  strokeWidth={1}
                  initial={{ r, opacity: 0.8 }}
                  animate={{ r: r + 7, opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={3}
                fill={isUsed ? meta.hue : "var(--rail-idle)"}
              />
              <text
                x={n.x}
                y={n.y + r + 11}
                textAnchor="middle"
                style={{
                  fill: isUsed ? meta.hueOnSurface : "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8.5,
                  letterSpacing: "0.08em",
                }}
              >
                {meta.code}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
