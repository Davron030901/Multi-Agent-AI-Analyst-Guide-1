"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Info, Lock } from "lucide-react";
import { Button, Dialog, StatusPill } from "@/components/primitives";
import { copy } from "@/lib/copy";

type KeyId = "gemini" | "qdrant" | "tavily" | "langfuse";

const STORAGE_KEY = "analyst-keys";

const KEYS: {
  id: KeyId;
  required: boolean;
  /** A cheap shape check — never a validity claim. */
  looksRight: (v: string) => boolean;
  /** What turns off if this key is missing. */
  disables?: string;
}[] = [
  { id: "gemini", required: true, looksRight: (v) => v.startsWith("AIza") && v.length > 30 },
  { id: "qdrant", required: false, looksRight: (v) => v.startsWith("http") },
  {
    id: "tavily",
    required: false,
    looksRight: (v) => v.startsWith("tvly-"),
    disables: "Web",
  },
  { id: "langfuse", required: false, looksRight: (v) => v.startsWith("pk-lf-") },
];

export function SetupModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (keys: Record<KeyId, string>) => void;
}) {
  const [values, setValues] = useState<Record<KeyId, string>>({
    gemini: "",
    qdrant: "",
    tavily: "",
    langfuse: "",
  });
  const [shown, setShown] = useState<Record<KeyId, boolean>>({
    gemini: false,
    qdrant: false,
    tavily: false,
    langfuse: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setValues((v) => ({ ...v, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed storage */
    }
  }, [open]);

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      onSaved?.(values);
    } catch {
      /* private mode */
    }
  }

  function clear() {
    setValues({ gemini: "", qdrant: "", tavily: "", langfuse: "" });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.setup.title}
      description={copy.setup.sub}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={clear}>
            {copy.setup.clear}
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            {saved ? copy.setup.saved : copy.setup.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {KEYS.map(({ id, required, looksRight, disables }) => {
          const meta = copy.setup.keys[id];
          const value = values[id];
          const set = value.length > 0;
          const suspicious = set && !looksRight(value);

          return (
            <div key={id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`key-${id}`}
                  className="text-[14px] font-medium text-[var(--text)]"
                >
                  {meta.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="label-micro" style={{ color: "var(--text-faint)" }}>
                    {required ? copy.setup.required : copy.setup.optional}
                  </span>
                  <StatusPill
                    tone={suspicious ? "warn" : set ? "ok" : required ? "error" : "neutral"}
                  >
                    {suspicious
                      ? copy.setup.status.invalid
                      : set
                        ? copy.setup.status.set
                        : copy.setup.status.unset}
                  </StatusPill>
                </div>
              </div>

              <div
                className="mt-1.5 flex items-center gap-1 rounded-[6px] border px-2"
                style={{ borderColor: suspicious ? "var(--warn)" : "var(--line)" }}
              >
                <Lock
                  size={13}
                  strokeWidth={1.75}
                  aria-hidden
                  className="flex-none"
                  style={{ color: "var(--text-faint)" }}
                />
                <input
                  id={`key-${id}`}
                  type={shown[id] ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
                  placeholder={meta.placeholder}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-h-[40px] flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-[var(--text-faint)]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShown((s) => ({ ...s, [id]: !s[id] }))}
                  aria-label={shown[id] ? copy.setup.hide : copy.setup.show}
                >
                  {shown[id] ? (
                    <EyeOff size={14} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Eye size={14} strokeWidth={1.75} aria-hidden />
                  )}
                </Button>
              </div>

              <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                {meta.help}
              </p>

              {/* An unset optional key is a state, not an error. */}
              {!set && disables && (
                <p
                  className="mt-1.5 flex items-start gap-1.5 rounded-[6px] border px-2 py-1.5 text-[13px] leading-snug"
                  style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
                >
                  <Info
                    size={12}
                    strokeWidth={1.75}
                    aria-hidden
                    className="mt-[3px] flex-none"
                    style={{ color: "var(--text-faint)" }}
                  />
                  <span>
                    The <strong className="font-medium text-[var(--text)]">{disables}</strong>{" "}
                    agent stays off. The supervisor routes around it and the run says so —
                    nothing errors.
                  </span>
                </p>
              )}
            </div>
          );
        })}

        <p
          className="flex items-start gap-1.5 border-t border-[var(--line)] pt-3 text-[13px] leading-snug"
          style={{ color: "var(--text-muted)" }}
        >
          <Lock
            size={12}
            strokeWidth={1.75}
            aria-hidden
            className="mt-[3px] flex-none"
            style={{ color: "var(--text-faint)" }}
          />
          {copy.setup.storedLocally}
        </p>
      </div>
    </Dialog>
  );
}
