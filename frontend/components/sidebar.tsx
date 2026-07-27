"use client";

import {
  Database,
  FileText,
  KeyRound,
  MessageSquare,
  PanelLeftClose,
  Plus,
} from "lucide-react";
import { AgentChip } from "@/components/agent-badge";
import { Button, StatusPill } from "@/components/primitives";
import { SPECIALISTS, type AgentName } from "@/lib/agents";
import { copy } from "@/lib/copy";

export interface DocumentEntry {
  name: string;
  status: "ready" | "pending" | "failed";
  chunks?: number;
}

export interface SidebarProps {
  history: { id: string; question: string }[];
  activeId?: string | null;
  documents: DocumentEntry[];
  dbConnected: boolean;
  enabled: Record<AgentName, boolean>;
  onToggleAgent: (agent: AgentName) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenKeys: () => void;
  onCollapse?: () => void;
  /** Icon-only rail at 1024–1279px. */
  compact?: boolean;
}

export function Sidebar(props: SidebarProps) {
  if (props.compact) return <CompactRail {...props} />;

  const {
    history,
    activeId,
    documents,
    dbConnected,
    enabled,
    onToggleAgent,
    onSelect,
    onNew,
    onOpenKeys,
    onCollapse,
  } = props;

  return (
    <nav
      aria-label="Workspace"
      className="flex h-full min-h-0 flex-col"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <Button variant="outline" size="sm" onClick={onNew} className="flex-1">
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          {copy.sidebar.newRun}
        </Button>
        {onCollapse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapse}
            aria-label={copy.sidebar.collapse}
            className="hidden lg:inline-flex"
          >
            <PanelLeftClose size={15} strokeWidth={1.75} aria-hidden />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <Section title={copy.sidebar.history}>
          {history.length === 0 ? (
            <p className="px-1 text-[13px] text-[var(--text-muted)]">
              Nothing yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(h.id)}
                    aria-current={activeId === h.id ? "true" : undefined}
                    className="flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-[var(--dur-hover)] hover:bg-[var(--surface-2)]"
                    style={{
                      background: activeId === h.id ? "var(--surface-2)" : undefined,
                      borderLeft: `2px solid ${activeId === h.id ? "var(--supervisor)" : "transparent"}`,
                    }}
                  >
                    <MessageSquare
                      size={13}
                      strokeWidth={1.75}
                      aria-hidden
                      className="mt-[3px] flex-none"
                      style={{ color: "var(--text-faint)" }}
                    />
                    <span className="line-clamp-2 text-[13px] leading-snug text-[var(--text-muted)]">
                      {h.question}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={copy.sidebar.documents}>
          {documents.length === 0 ? (
            <p className="px-1 text-[13px] text-[var(--text-muted)]">
              {copy.sidebar.documentsEmpty}
            </p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li
                  key={doc.name}
                  className="flex items-center gap-2 px-1 py-0.5"
                >
                  <FileText
                    size={13}
                    strokeWidth={1.75}
                    aria-hidden
                    className="flex-none"
                    style={{
                      color:
                        doc.status === "ready"
                          ? "var(--retriever-on-surface)"
                          : "var(--text-faint)",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-muted)]">
                    {doc.name}
                  </span>
                  <IngestStatus status={doc.status} chunks={doc.chunks} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={copy.sidebar.database}>
          <div className="flex items-center gap-2 px-1">
            <Database
              size={13}
              strokeWidth={1.75}
              aria-hidden
              style={{
                color: dbConnected ? "var(--data-on-surface)" : "var(--text-faint)",
              }}
            />
            <span className="text-[13px] text-[var(--text-muted)]">
              {dbConnected ? copy.sidebar.dbConnected : copy.sidebar.dbMissing}
            </span>
          </div>
        </Section>

        <Section title={copy.sidebar.agentsTitle} help={copy.sidebar.agentsHelp}>
          <div className="space-y-1.5">
            {SPECIALISTS.map((agent) => (
              <AgentChip
                key={agent}
                agent={agent}
                enabled={enabled[agent]}
                onToggle={() => onToggleAgent(agent)}
              />
            ))}
          </div>
        </Section>
      </div>

      <div className="hairline-t p-3">
        <Button variant="ghost" size="sm" onClick={onOpenKeys} className="w-full">
          <KeyRound size={14} strokeWidth={1.75} aria-hidden />
          {copy.setup.title}
        </Button>
      </div>
    </nav>
  );
}

function CompactRail({ onNew, onOpenKeys, onCollapse }: SidebarProps) {
  return (
    <nav
      aria-label="Workspace"
      className="flex h-full w-16 flex-col items-center gap-2 py-3"
      style={{ background: "var(--surface)" }}
    >
      <Button variant="ghost" size="sm" onClick={onNew} aria-label={copy.sidebar.newRun}>
        <Plus size={16} strokeWidth={1.75} aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCollapse}
        aria-label={copy.sidebar.expand}
      >
        <MessageSquare size={16} strokeWidth={1.75} aria-hidden />
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onOpenKeys} aria-label={copy.setup.title}>
        <KeyRound size={16} strokeWidth={1.75} aria-hidden />
      </Button>
    </nav>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="label-micro mb-1.5 px-1" style={{ color: "var(--text-faint)" }}>
        {title}
      </h2>
      {help && (
        <p className="mb-2 px-1 text-[12px] leading-snug text-[var(--text-faint)]">
          {help}
        </p>
      )}
      {children}
    </section>
  );
}

function IngestStatus({
  status,
  chunks,
}: {
  status: DocumentEntry["status"];
  chunks?: number;
}) {
  if (status === "ready") {
    return (
      <span className="tnum label-micro flex-none" style={{ color: "var(--ok-on-surface)" }}>
        {chunks ?? ""} {copy.sidebar.ingestReady}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="label-micro flex-none" style={{ color: "var(--warn-on-surface)" }}>
        {copy.sidebar.ingestPending}
      </span>
    );
  }
  return <StatusPill tone="error">{copy.sidebar.ingestFailed}</StatusPill>;
}
