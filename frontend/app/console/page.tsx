"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, PanelRightOpen, Sparkles } from "lucide-react";
import { AnswerCard } from "@/components/answer-card";
import { CommandPalette, useCommandPalette, type Command } from "@/components/command-palette";
import { Composer } from "@/components/composer";
import { EvidencePanel, type PanelTab } from "@/components/evidence-panel";
import { Button, Sheet, StatusPill } from "@/components/primitives";
import { Rail } from "@/components/rail/rail";
import { RailStrip } from "@/components/rail/rail-strip";
import { SetupModal } from "@/components/setup-modal";
import { Sidebar, type DocumentEntry } from "@/components/sidebar";
import { SiteHeader } from "@/components/site-header";
import { AnswerSkeleton, RailSkeleton } from "@/components/skeletons";
import { agentMeta, SPECIALISTS, type AgentName } from "@/lib/agents";
import { checkHealth } from "@/lib/client";
import { copy } from "@/lib/copy";
import { EXAMPLE_QUESTIONS } from "@/lib/mock/stream";
import type { Run, Station } from "@/lib/events";
import { useRun } from "@/lib/use-run";

const DOCUMENTS: DocumentEntry[] = [
  { name: "churn_postmortem_q2_2026.md", status: "ready", chunks: 11 },
  { name: "pricing_and_packaging.md", status: "ready", chunks: 8 },
  { name: "support_sla_policy.md", status: "ready", chunks: 7 },
  { name: "product_roadmap_h2_2026.md", status: "ready", chunks: 9 },
  { name: "customer_success_playbook.md", status: "ready", chunks: 12 },
  { name: "security_and_compliance.md", status: "pending" },
];

export default function ConsolePage() {
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<PanelTab>("evidence");
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [cite, setCite] = useState<number | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<Record<AgentName, boolean>>({
    supervisor: true,
    retriever: true,
    web: true,
    data: true,
    code: true,
    critic: true,
  });

  const { runs, current, busy, usingMock, start, stop, reset } = useRun();
  const palette = useCommandPalette();
  const railRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void checkHealth().then((h) => setLive(h?.ok ?? false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [runs.length]);

  const send = useCallback(
    (q?: string) => {
      const question = (q ?? input).trim();
      if (!question) return;
      setInput("");
      start(question);
    },
    [input, start],
  );

  const openStation = useCallback((station: Station) => {
    const target = agentMeta(station.agent).tab;
    setTab(target);
    setPanelOpen(true);
    setSheetOpen(true);
  }, []);

  const commands: Command[] = useMemo(
    () => [
      ...EXAMPLE_QUESTIONS.map((e, i) => ({
        id: `q${i}`,
        label: e.q,
        hint: e.path,
        group: "Ask",
        run: () => send(e.q),
      })),
      {
        id: "new",
        label: copy.sidebar.newRun,
        group: "Workspace",
        run: () => reset(),
      },
      {
        id: "keys",
        label: copy.setup.title,
        group: "Workspace",
        run: () => setKeysOpen(true),
      },
      ...(["evidence", "sql", "code", "trace"] as PanelTab[]).map((t) => ({
        id: `tab-${t}`,
        label: `Show ${copy.panel.tabs[t]}`,
        group: "Panel",
        run: () => {
          setTab(t);
          setPanelOpen(true);
        },
      })),
    ],
    [send, reset],
  );

  const history = runs.map((r) => ({ id: r.id, question: r.question }));

  const sidebar = (
    <Sidebar
      history={history}
      activeId={current?.id}
      documents={DOCUMENTS}
      dbConnected
      enabled={enabled}
      onToggleAgent={(a) => setEnabled((e) => ({ ...e, [a]: !e[a] }))}
      onSelect={() => setNavOpen(false)}
      onNew={() => {
        reset();
        setNavOpen(false);
      }}
      onOpenKeys={() => {
        setKeysOpen(true);
        setNavOpen(false);
      }}
    />
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader
        onOpenKeys={() => setKeysOpen(true)}
        onOpenPalette={() => palette.setOpen(true)}
        onOpenNav={() => setNavOpen(true)}
        right={
          live === false || usingMock ? (
            <StatusPill tone="warn">Recorded run</StatusPill>
          ) : live ? (
            <StatusPill tone="ok">Live</StatusPill>
          ) : null
        }
      />

      {/* Mobile: the rail lies down under the header. */}
      {current && current.stations.length > 0 && (
        <div className="sticky top-[52px] z-20 sm:hidden">
          <RailStrip run={current} onSelect={openStation} />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1560px] flex-1 overflow-hidden">
        {/* Zone 1 — sidebar. Drawer under 1024, rail to 1279, panel above. */}
        <aside className="hidden w-[260px] flex-none border-r border-[var(--line)] lg:block">
          {sidebar}
        </aside>

        {/* Zone 2 — conversation */}
        <main
          id="main"
          className="flex min-w-0 flex-1 flex-col"
          aria-busy={busy}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            <div className="mx-auto w-full max-w-[820px] space-y-8">
              {(live === false || usingMock) && <MockNotice />}

              {runs.length === 0 && <EmptyState onPick={send} />}

              {runs.map((run) => (
                <RunBlock
                  key={run.id}
                  run={run}
                  railRef={railRef}
                  onOpenPanel={openStation}
                  onCite={setCite}
                  onRerun={() => send(run.question)}
                />
              ))}

              <div ref={bottomRef} />
            </div>
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            onStop={stop}
            busy={busy}
          />
        </main>

        {/* Zone 3 — evidence. Overlay drawer to 1279, docked at ≥1280. */}
        {panelOpen && (
          <aside
            className="hidden w-[360px] flex-none border-l border-[var(--line)] xl:block xl:w-[360px] 2xl:w-[420px]"
            style={{ background: "var(--surface)" }}
            aria-label={copy.panel.title}
          >
            <EvidencePanel
              run={current}
              tab={tab}
              onTabChange={setTab}
              showGraph
              highlightSource={cite}
            />
          </aside>
        )}
      </div>

      {/* Floating opener for the panel below 1280px. */}
      {current && current.stations.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-[92px] right-3 z-20 xl:hidden"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}
        >
          <PanelRightOpen size={14} strokeWidth={1.75} aria-hidden />
          {copy.panel.open}
        </Button>
      )}

      {/* Mobile / tablet: sidebar drawer */}
      <Sheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        side="left"
        label="Workspace"
      >
        {sidebar}
      </Sheet>

      {/* Mobile: bottom sheet. Tablet/laptop: right drawer. */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        side="bottom"
        label={copy.panel.title}
      >
        <div className="min-h-0 flex-1 overflow-hidden">
          <EvidencePanel
            run={current}
            tab={tab}
            onTabChange={setTab}
            highlightSource={cite}
          />
        </div>
      </Sheet>

      <SetupModal open={keysOpen} onClose={() => setKeysOpen(false)} />
      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        commands={commands}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ states */

function RunBlock({
  run,
  railRef,
  onOpenPanel,
  onCite,
  onRerun,
}: {
  run: Run;
  railRef: React.RefObject<HTMLDivElement | null>;
  onOpenPanel: (s: Station) => void;
  onCite: (n: number | null) => void;
  onRerun: () => void;
}) {
  const streaming = run.status === "streaming";
  const lastGate = run.gates[run.gates.length - 1];
  const revising = streaming && lastGate?.ok === false;

  return (
    <section className="space-y-4">
      <h2 className="font-display-tight measure text-[18px] leading-snug sm:text-[22px]">
        {run.question}
      </h2>

      {revising && <RevisionNotice reason={lastGate.reason} revision={lastGate.revision + 1} />}

      <div ref={railRef} className="scroll-mt-24">
        {run.stations.length === 0 && streaming ? (
          <RailSkeleton />
        ) : (
          <Rail run={run} onOpenPanel={onOpenPanel} />
        )}
      </div>

      {run.answer ? (
        <AnswerCard
          run={run}
          onCite={onCite}
          onRerun={onRerun}
          onJumpToRail={() =>
            railRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
      ) : streaming ? (
        <AnswerSkeleton />
      ) : run.status === "error" ? (
        <ErrorCard message={run.error ?? copy.errors.generic.body} />
      ) : null}
    </section>
  );
}

/** A rejection is a feature. It reads as one. */
function RevisionNotice({ reason, revision }: { reason: string; revision: number }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5"
      style={{ borderColor: "var(--warn)", borderLeftWidth: 2 }}
      role="status"
    >
      <Sparkles
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="mt-[3px] flex-none"
        style={{ color: "var(--warn-on-surface)" }}
      />
      <div className="min-w-0">
        <p className="label-micro" style={{ color: "var(--warn-on-surface)" }}>
          {copy.console.revisionRunning(revision).toUpperCase()}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
          <span className="text-[var(--text)]">{copy.critic.rejected}:</span> {reason}
        </p>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="panel px-4 py-3"
      style={{ borderLeft: "2px solid var(--error)" }}
      role="alert"
    >
      <p className="label-micro" style={{ color: "var(--error-on-surface)" }}>
        {copy.errors.generic.title.toUpperCase()}
      </p>
      <p className="mt-1 text-[14px] leading-snug text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section className="pt-6">
      <h2 className="font-display-tight measure text-[22px] leading-tight sm:text-[30px]">
        {copy.console.empty.title}
      </h2>
      <p className="measure mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
        {copy.console.empty.body}
      </p>

      <h3 className="label-micro mb-2 mt-6" style={{ color: "var(--text-faint)" }}>
        {copy.console.empty.examplesLabel}
      </h3>
      <ul className="space-y-2">
        {EXAMPLE_QUESTIONS.map((ex) => (
          <li key={ex.q}>
            <button
              type="button"
              onClick={() => onPick(ex.q)}
              className="group w-full rounded-[10px] border px-3.5 py-3 text-left transition-colors duration-[var(--dur-hover)] hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--line)", borderLeftWidth: 2 }}
            >
              <span className="block text-[15px] leading-snug text-[var(--text)]">
                {ex.q}
              </span>
              <span
                className="label-micro mt-1.5 block"
                style={{ color: "var(--text-faint)" }}
              >
                {ex.path.toUpperCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MockNotice() {
  return (
    <div
      className="flex items-start gap-2 rounded-[10px] border px-3 py-2.5"
      style={{ borderColor: "var(--line)", borderLeftWidth: 2 }}
    >
      <Info
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="mt-[3px] flex-none"
        style={{ color: "var(--text-faint)" }}
      />
      <div>
        <p className="text-[14px] text-[var(--text)]">{copy.errors.backendDown.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">
          {copy.errors.backendDown.body}
        </p>
      </div>
    </div>
  );
}
