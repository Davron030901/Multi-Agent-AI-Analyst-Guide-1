"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Menu, Search } from "lucide-react";
import { Button } from "@/components/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { copy } from "@/lib/copy";

export function SiteHeader({
  onOpenKeys,
  onOpenPalette,
  onOpenNav,
  right,
}: {
  onOpenKeys?: () => void;
  onOpenPalette?: () => void;
  onOpenNav?: () => void;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/console", label: copy.nav.console },
    { href: "/evaluation", label: copy.nav.evaluation },
  ];

  return (
    <header
      className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-[var(--line)] px-3 sm:px-4"
      style={{ background: "var(--canvas)" }}
    >
      {onOpenNav && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenNav}
          aria-label="Open menu"
          className="lg:hidden"
        >
          <Menu size={16} strokeWidth={1.75} aria-hidden />
        </Button>
      )}

      <Link
        href="/"
        className="flex items-center gap-2 rounded-[4px]"
        aria-label={copy.product.name}
      >
        <Mark />
        <span className="font-display-tight hidden text-[15px] sm:inline">
          {copy.product.name}
        </span>
      </Link>

      <nav className="ml-2 flex items-center gap-0.5" aria-label="Sections">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className="label-micro relative rounded-[4px] px-2 py-2"
              style={{ color: active ? "var(--text)" : "var(--text-faint)" }}
            >
              {l.label}
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-[6px] h-[1.5px]"
                style={{ background: active ? "var(--supervisor)" : "transparent" }}
              />
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {right}
        {onOpenPalette && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenPalette}
            aria-label={copy.nav.commandPalette}
            className="hidden sm:inline-flex"
          >
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <kbd
              className="label-micro rounded-[4px] border px-1"
              style={{ borderColor: "var(--line)", color: "var(--text-faint)" }}
            >
              ⌘K
            </kbd>
          </Button>
        )}
        {onOpenKeys && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenKeys}
            aria-label={copy.setup.title}
          >
            <KeyRound size={15} strokeWidth={1.75} aria-hidden />
          </Button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Six stations on a rail — the product's mark is the product's diagram. */
function Mark() {
  const hues = [
    "var(--supervisor)",
    "var(--retriever)",
    "var(--data)",
    "var(--code)",
    "var(--critic)",
  ];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="flex-none">
      <line x1="4" y1="2" x2="4" y2="16" stroke="var(--line)" strokeWidth="1.5" />
      {hues.map((hue, i) => (
        <circle key={hue} cx="4" cy={2.5 + i * 3.2} r="1.7" fill={hue} />
      ))}
      <line x1="8" y1="9" x2="15" y2="9" stroke="var(--line)" strokeWidth="1.5" />
      <circle cx="15" cy="9" r="1.7" fill="var(--ok)" />
    </svg>
  );
}
