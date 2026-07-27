"use client";

import { agentMeta, agentVars, type AgentName } from "@/lib/agents";

/**
 * The hue is never the only carrier of meaning: every badge pairs it with the
 * agent's mono label and its icon. Colour-blind users and greyscale printouts
 * read the same information.
 */
export function AgentBadge({
  agent,
  size = "sm",
  showIcon = true,
  muted = false,
}: {
  agent: AgentName;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  muted?: boolean;
}) {
  const meta = agentMeta(agent);
  const Icon = meta.icon;
  const dim = size === "xs" ? 11 : size === "md" ? 15 : 13;

  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      style={agentVars(agent)}
    >
      {showIcon && (
        <Icon
          size={dim}
          strokeWidth={1.75}
          aria-hidden
          style={{ color: muted ? "var(--text-faint)" : "var(--agent-text)" }}
        />
      )}
      <span
        className="label-micro"
        style={{ color: muted ? "var(--text-faint)" : "var(--agent-text)" }}
      >
        {meta.code}
      </span>
    </span>
  );
}

/** The 8px status dot. `state` is also announced in text by the caller. */
export function AgentDot({
  agent,
  state = "done",
  size = 8,
}: {
  agent: AgentName;
  state?: "idle" | "running" | "done" | "error";
  size?: number;
}) {
  const running = state === "running";
  const idle = state === "idle";
  const error = state === "error";

  return (
    <span
      aria-hidden
      className={running ? "breathe" : undefined}
      style={{
        ...agentVars(agent),
        width: size,
        height: size,
        borderRadius: 999,
        display: "inline-block",
        flex: "none",
        background: error
          ? "var(--error)"
          : idle
            ? "transparent"
            : "var(--agent)",
        border: idle ? "1.5px solid var(--rail-idle)" : "none",
        transition: "background var(--dur-state) var(--ease)",
      }}
    />
  );
}

/** A pill for the sidebar toggles and the landing chips. */
export function AgentChip({
  agent,
  enabled = true,
  onToggle,
  hint,
}: {
  agent: AgentName;
  enabled?: boolean;
  onToggle?: () => void;
  hint?: string;
}) {
  const meta = agentMeta(agent);
  const Icon = meta.icon;
  const interactive = Boolean(onToggle);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive
        ? {
            type: "button" as const,
            onClick: onToggle,
            "aria-pressed": enabled,
            "aria-label": `${meta.name}: ${enabled ? "on" : "off"}`,
          }
        : {})}
      className={[
        "group flex w-full items-start gap-2.5 rounded-[6px] border px-2.5 py-2 text-left",
        "transition-colors duration-[var(--dur-hover)]",
        interactive ? "hover:bg-[var(--surface-2)]" : "",
      ].join(" ")}
      style={{
        ...agentVars(agent),
        borderColor: "var(--line)",
        // The identity hue lives on a 2px left rail — never a filled background.
        borderLeft: `2px solid ${enabled ? "var(--agent)" : "var(--rail-idle)"}`,
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="mt-0.5 flex-none"
        style={{ color: enabled ? "var(--agent-text)" : "var(--text-faint)" }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className="label-micro"
            style={{ color: enabled ? "var(--agent-text)" : "var(--text-faint)" }}
          >
            {meta.code}
          </span>
          {interactive && (
            <span className="label-micro" style={{ color: "var(--text-faint)" }}>
              {enabled ? "ON" : "OFF"}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[var(--text-muted)]">
          {hint ?? meta.blurb}
        </span>
      </span>
    </Tag>
  );
}
