"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/primitives";
import { copy } from "@/lib/copy";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content, but cap it — the rail must stay visible.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  return (
    <div
      className="safe-b sticky bottom-0 border-t border-[var(--line)] px-3 pb-3 pt-2.5 sm:px-4"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="panel flex items-end gap-2 px-2.5 py-2"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <label htmlFor="composer" className="sr-only">
          {copy.console.composer.placeholder}
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            } else if (e.key === "Enter" && !e.shiftKey && !busy) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={copy.console.composer.placeholder}
          className="max-h-[168px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-[1.5] outline-none placeholder:text-[var(--text-faint)]"
        />

        {busy ? (
          <Button variant="outline" size="sm" onClick={onStop}>
            <Square size={12} strokeWidth={2} aria-hidden />
            {copy.console.composer.stop}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onSend}
            disabled={!value.trim()}
            aria-label={copy.console.composer.send}
          >
            {copy.console.composer.send}
            <ArrowUp size={13} strokeWidth={2.25} aria-hidden />
          </Button>
        )}
      </div>

      <p
        className="label-micro mt-1.5 hidden px-1 sm:block"
        style={{ color: "var(--text-faint)" }}
      >
        {copy.console.composer.hint}
      </p>
    </div>
  );
}
