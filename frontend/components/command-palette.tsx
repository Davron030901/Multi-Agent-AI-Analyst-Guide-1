"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { copy } from "@/lib/copy";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Focus after the portal has painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (index >= results.length) setIndex(0);
  }, [results.length, index]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  if (!mounted || !open) return null;

  const groups = results.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  let flat = -1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in srgb, var(--canvas) 82%, transparent)" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.nav.commandPalette}
        className="panel relative z-10 w-full max-w-[520px] overflow-hidden"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Search
            size={15}
            strokeWidth={1.75}
            aria-hidden
            style={{ color: "var(--text-faint)" }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => (i + 1) % Math.max(results.length, 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                results[index]?.run();
                onClose();
              }
            }}
            placeholder="Search actions and questions…"
            aria-label={copy.nav.commandPalette}
            className="min-h-[44px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--text-faint)]"
          />
          <kbd
            className="label-micro rounded-[4px] border px-1.5 py-0.5"
            style={{ borderColor: "var(--line)", color: "var(--text-faint)" }}
          >
            ESC
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-2.5 py-6 text-center text-[13px] text-[var(--text-muted)]">
              Nothing matches “{query}”.
            </li>
          )}

          {Object.entries(groups).map(([group, items]) => (
            <li key={group}>
              <p
                className="label-micro px-2.5 pb-1 pt-2"
                style={{ color: "var(--text-faint)" }}
              >
                {group}
              </p>
              <ul>
                {items.map((cmd) => {
                  flat += 1;
                  const active = flat === index;
                  const myIndex = flat;
                  return (
                    <li key={cmd.id}>
                      <button
                        type="button"
                        data-i={myIndex}
                        onMouseEnter={() => setIndex(myIndex)}
                        onClick={() => {
                          cmd.run();
                          onClose();
                        }}
                        className="flex min-h-[40px] w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left"
                        style={{
                          background: active ? "var(--surface-2)" : "transparent",
                          borderLeft: `2px solid ${active ? "var(--supervisor)" : "transparent"}`,
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-[var(--text)]">
                            {cmd.label}
                          </span>
                          {cmd.hint && (
                            <span className="block truncate text-[12px] text-[var(--text-muted)]">
                              {cmd.hint}
                            </span>
                          )}
                        </span>
                        {active && (
                          <CornerDownLeft
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden
                            style={{ color: "var(--text-faint)" }}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/** ⌘K / Ctrl+K anywhere. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
