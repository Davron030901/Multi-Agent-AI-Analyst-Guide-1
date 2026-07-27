"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* ===========================================================================
   Hand-written primitives instead of the shadcn CLI.

   The brief says "restyled to the tokens above — do not ship the default
   shadcn look". Restyling shadcn means overriding a ring system, a radius
   scale and a colour scale we do not use, in every component. Writing the four
   primitives we actually need is less code than the overrides would be, and
   nothing arrives with an opinion we then have to argue with.
   =========================================================================== */

/* ---------------------------------- Button ------------------------------- */

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium " +
  "transition-colors duration-[var(--dur-hover)] disabled:opacity-40 " +
  "disabled:cursor-not-allowed whitespace-nowrap";

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on coarse pointers.
  sm: "h-8 px-2.5 text-[13px] [@media(pointer:coarse)]:h-11",
  md: "h-9 px-3.5 text-[14px] [@media(pointer:coarse)]:h-11",
};

const VARIANTS: Record<Variant, string> = {
  // Deliberately NOT supervisor-violet. Agent hues are data: violet means
  // "the supervisor", and spending it on every primary button would teach the
  // opposite. A high-contrast neutral key reads as instrument hardware and
  // measures 16:1 in both themes.
  primary: "text-[var(--canvas)] hover:opacity-90 [background:var(--text)]",
  outline: "border border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  danger: "border text-[var(--error-on-surface)] hover:bg-[var(--surface-2)]",
};

/**
 * The button's classes as a string, so an anchor or a Next `<Link>` can wear
 * them directly. Nesting a `<Link>` inside a `<button>` would be invalid HTML
 * and a keyboard trap — two focusable elements for one action.
 */
export function buttonClasses({
  variant = "outline",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      {...rest}
      className={buttonClasses({ variant, size, className })}
      style={
        variant === "danger" ? { borderColor: "var(--error)", ...rest.style } : rest.style
      }
    >
      {children}
    </button>
  );
}

/* ---------------------------------- Dialog -------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape closes; Tab is trapped inside the panel.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(
      "input, button, [href], select, textarea, [tabindex]:not([tabindex='-1'])",
    )?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* A flat scrim, not a blur. Glassmorphism is on the do-not list. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in srgb, var(--canvas) 82%, transparent)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="panel safe-b relative z-10 max-h-[92dvh] w-full overflow-y-auto sm:max-h-[86dvh]"
        style={{
          maxWidth: width,
          boxShadow: "var(--shadow)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 id={titleId} className="font-display-tight text-[18px] leading-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-[13px] text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={1.75} aria-hidden />
          </Button>
        </header>

        <div className="px-4 py-4">{children}</div>

        {footer && (
          <footer className="hairline-t flex items-center justify-end gap-2 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------- Tabs --------------------------------- */

interface TabsContext {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}
const TabsCtx = createContext<TabsContext | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
}) {
  const baseId = useId();
  return (
    <TabsCtx.Provider value={{ value, setValue: onValueChange, baseId }}>
      {children}
    </TabsCtx.Provider>
  );
}

export function TabList({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Arrow keys move between tabs — the expected pattern for a tablist.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? [],
    );
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : e.key === "ArrowLeft"
            ? (i - 1 + tabs.length) % tabs.length
            : (i + 1) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }, []);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex items-stretch gap-0 border-b border-[var(--line)]"
    >
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsCtx);
  if (!ctx) return null;
  const selected = ctx.value === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className="label-micro relative min-h-[38px] flex-1 px-2 py-2 transition-colors duration-[var(--dur-hover)] [@media(pointer:coarse)]:min-h-[44px]"
      style={{ color: selected ? "var(--text)" : "var(--text-faint)" }}
    >
      {children}
      {/* The selected tab is marked by a 2px underline AND by contrast — never
          colour alone. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-[-1px] h-[2px]"
        style={{
          background: selected ? "var(--supervisor)" : "transparent",
          transition: "background var(--dur-state) var(--ease)",
        }}
      />
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsCtx);
  if (!ctx || ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/* ---------------------------------- Sheet --------------------------------- */

/** A drawer: side on desktop, bottom sheet with a drag handle on mobile. */
export function Sheet({
  open,
  onClose,
  side = "right",
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right" | "bottom";
  label: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const isBottom = side === "bottom";

  return createPortal(
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in srgb, var(--canvas) 76%, transparent)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={[
          "absolute flex flex-col border-[var(--line)]",
          isBottom
            ? "safe-b inset-x-0 bottom-0 max-h-[82dvh] rounded-t-[10px] border-t"
            : side === "left"
              ? "inset-y-0 left-0 w-[86vw] max-w-[300px] border-r"
              : "inset-y-0 right-0 w-[90vw] max-w-[380px] border-l",
        ].join(" ")}
        style={{ background: "var(--surface)" }}
      >
        {isBottom && (
          <div className="flex justify-center pb-1 pt-2" aria-hidden>
            <span
              className="block h-[4px] w-9 rounded-full"
              style={{ background: "var(--line)" }}
            />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------- Status pill ------------------------------ */

export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error" | "neutral";
  children: ReactNode;
}) {
  const map = {
    ok: { fg: "var(--ok-on-surface)", bd: "var(--ok)" },
    warn: { fg: "var(--warn-on-surface)", bd: "var(--warn)" },
    error: { fg: "var(--error-on-surface)", bd: "var(--error)" },
    neutral: { fg: "var(--text-muted)", bd: "var(--line)" },
  }[tone];

  return (
    <span
      className="label-micro inline-flex items-center gap-1.5 rounded-[999px] border px-2 py-[3px]"
      style={{ color: map.fg, borderColor: map.bd }}
    >
      {children}
    </span>
  );
}
