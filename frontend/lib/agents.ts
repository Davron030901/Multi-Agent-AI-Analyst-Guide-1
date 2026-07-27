import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Braces,
  Database,
  FileText,
  Globe,
  ShieldCheck,
} from "lucide-react";

export type AgentName =
  | "supervisor"
  | "retriever"
  | "web"
  | "data"
  | "code"
  | "critic";

export interface AgentMeta {
  /** Mono label shown on the rail. */
  code: string;
  /** Human name. */
  name: string;
  /** One line, in the user's vocabulary — "Sources", not "vector chunks". */
  blurb: string;
  /** CSS variable holding the identity hue. */
  hue: string;
  /** Label-safe variant that meets AA on --surface in both themes. */
  hueOnSurface: string;
  icon: LucideIcon;
  /** Which right-panel tab this agent's evidence lands in. */
  tab: "evidence" | "sql" | "code" | "trace";
}

export const AGENTS: Record<AgentName, AgentMeta> = {
  supervisor: {
    code: "SUPERVISOR",
    name: "Supervisor",
    blurb: "Reads the question and decides which specialist runs next.",
    hue: "var(--supervisor)",
    hueOnSurface: "var(--supervisor-on-surface)",
    icon: Boxes,
    tab: "trace",
  },
  retriever: {
    code: "RETRIEVER",
    name: "Retriever",
    blurb: "Searches your documents and returns the passages that matter.",
    hue: "var(--retriever)",
    hueOnSurface: "var(--retriever-on-surface)",
    icon: FileText,
    tab: "evidence",
  },
  web: {
    code: "WEB",
    name: "Web",
    blurb: "Looks things up on the live web when your documents can't answer.",
    hue: "var(--web)",
    hueOnSurface: "var(--web-on-surface)",
    icon: Globe,
    tab: "evidence",
  },
  data: {
    code: "DATA",
    name: "Data",
    blurb: "Writes a read-only SQL query, runs it, and reads the result.",
    hue: "var(--data)",
    hueOnSurface: "var(--data-on-surface)",
    icon: Database,
    tab: "sql",
  },
  code: {
    code: "CODE",
    name: "Code",
    blurb: "Writes and runs Python in a sandbox so the arithmetic is exact.",
    hue: "var(--code)",
    hueOnSurface: "var(--code-on-surface)",
    icon: Braces,
    tab: "code",
  },
  critic: {
    code: "CRITIC",
    name: "Critic",
    blurb: "Checks the answer against the evidence and can send it back.",
    hue: "var(--critic)",
    hueOnSurface: "var(--critic-on-surface)",
    icon: ShieldCheck,
    tab: "trace",
  },
};

export const AGENT_ORDER: AgentName[] = [
  "supervisor",
  "retriever",
  "web",
  "data",
  "code",
  "critic",
];

/** The four agents the supervisor can delegate to. */
export const SPECIALISTS: AgentName[] = ["retriever", "web", "data", "code"];

export function agentMeta(name: AgentName): AgentMeta {
  return AGENTS[name] ?? AGENTS.supervisor;
}

/**
 * Inline style carrying the agent hue as `--agent`, so a component can use
 * `tint`, `breathe` and `border-[var(--agent)]` without a colour switch.
 */
export function agentVars(name: AgentName): React.CSSProperties {
  const meta = agentMeta(name);
  return {
    ["--agent" as string]: meta.hue,
    ["--agent-text" as string]: meta.hueOnSurface,
  } as React.CSSProperties;
}
