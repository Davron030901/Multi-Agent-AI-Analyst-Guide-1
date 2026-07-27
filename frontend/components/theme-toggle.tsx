"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/primitives";
import { copy } from "@/lib/copy";

export type Theme = "dark" | "light";
export const THEME_KEY = "analyst-theme";

/**
 * The inline script that runs before first paint, so the correct theme is
 * applied without a flash. Rendered in <head> by the root layout.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_KEY}');
var m=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
document.documentElement.setAttribute('data-theme', s||m);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode — the theme simply does not persist */
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={copy.nav.theme}
      title={copy.nav.theme}
    >
      {theme === "dark" ? (
        <Sun size={15} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={15} strokeWidth={1.75} aria-hidden />
      )}
    </Button>
  );
}
