"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { AgentChip } from "@/components/agent-badge";
import { buttonClasses } from "@/components/primitives";
import { Rail } from "@/components/rail/rail";
import { SiteHeader } from "@/components/site-header";
import { AGENT_ORDER } from "@/lib/agents";
import { copy } from "@/lib/copy";
import {
  HERO_HEADLINE_NUMBER,
  HERO_HEADLINE_UNIT,
  HERO_QUESTION,
  heroStream,
} from "@/lib/mock/stream";
import { useReplay } from "@/lib/use-run";

export default function LandingPage() {
  const stream = useCallback((signal?: AbortSignal) => heroStream(signal), []);
  const run = useReplay(HERO_QUESTION, stream);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />

      <main id="main" className="mx-auto w-full max-w-[1560px] flex-1 px-4 sm:px-6">
        {/* ---------------------------------------------------------- hero */}
        <section className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-14 lg:py-16">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="label-micro" style={{ color: "var(--supervisor-on-surface)" }}>
              {copy.landing.eyebrow}
            </p>

            <h1 className="font-display-tight mt-3 text-[clamp(30px,7vw,44px)] leading-[1.06]">
              {copy.landing.headline}
            </h1>

            <p className="measure mt-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
              {copy.landing.sub}
            </p>

            {/* The thesis, stated as one real question and its verified number. */}
            <figure
              className="panel mt-7 px-4 py-4"
              style={{ borderLeft: "2px solid var(--ok)" }}
            >
              <figcaption className="label-micro" style={{ color: "var(--text-faint)" }}>
                THE QUESTION
              </figcaption>
              <p className="font-display-tight mt-1.5 text-[18px] leading-snug">
                {HERO_QUESTION}
              </p>

              <div className="mt-4 flex items-baseline gap-3">
                <span
                  className="tnum font-display-tight text-[44px] leading-none"
                  style={{ color: "var(--text)" }}
                >
                  {HERO_HEADLINE_NUMBER}
                </span>
                <span className="text-[14px] leading-snug text-[var(--text-muted)]">
                  {HERO_HEADLINE_UNIT}
                  <br />
                  <span className="label-micro" style={{ color: "var(--ok-on-surface)" }}>
                    VERIFIED BY THE CRITIC
                  </span>
                </span>
              </div>
            </figure>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/console" className={buttonClasses({ variant: "primary" })}>
                {copy.nav.openConsole}
                <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </Link>
              <p className="text-[13px] text-[var(--text-muted)]">
                {copy.landing.ctaNote}
              </p>
            </div>
          </div>

          {/* The rail, replaying. Not a screenshot — the same component the
              console renders, fed by a recorded stream. */}
          <div className="min-w-0">
            <div className="panel px-4 pb-3 pt-3.5 lg:sticky lg:top-[68px]">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                  {copy.landing.replayLabel}
                </span>
                <span
                  className="label-micro"
                  style={{ color: "var(--supervisor-on-surface)" }}
                >
                  LOOPING
                </span>
              </div>

              {/* Fixed min-height: the loop restarting must not resize the page. */}
              <div className="min-h-[380px] sm:min-h-[420px]">
                <Rail run={run} />
              </div>
            </div>

            <p className="mt-2.5 px-1 text-[13px] leading-snug text-[var(--text-muted)]">
              {copy.landing.replayCaption}
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- agents */}
        <section className="border-t border-[var(--line)] py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display-tight text-[22px]">{copy.landing.agentsTitle}</h2>
            <p className="text-[13px] text-[var(--text-muted)]">{copy.landing.agentsSub}</p>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_ORDER.map((agent) => (
              <li key={agent}>
                <AgentChip agent={agent} />
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------- how it works */}
        <section className="border-t border-[var(--line)] py-10">
          <h2 className="font-display-tight text-[22px]">{copy.landing.howTitle}</h2>

          <ol className="mt-5 grid gap-px overflow-hidden rounded-[10px] border border-[var(--line)] sm:grid-cols-5">
            {copy.landing.howSteps.map((step, i) => (
              <li
                key={step.k}
                className="px-3.5 py-3.5"
                style={{
                  background: "var(--surface)",
                  boxShadow: "0 0 0 1px var(--line)",
                }}
              >
                <span
                  className="tnum label-micro"
                  style={{ color: "var(--text-faint)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="font-display-tight mt-1 text-[15px]">{step.k}</p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                  {step.v}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <Link href="/console" className={buttonClasses({ variant: "primary" })}>
              {copy.nav.openConsole}
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--line)] px-4 py-5 sm:px-6">
        <p className="label-micro" style={{ color: "var(--text-faint)" }}>
          {copy.product.name} · LANGGRAPH · GEMINI OR OPENAI · QDRANT · TAVILY · LANGFUSE
        </p>
      </footer>
    </div>
  );
}
