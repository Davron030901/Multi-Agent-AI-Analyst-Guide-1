import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { copy } from "@/lib/copy";
import "./globals.css";

/* next/font downloads these at build time and serves them from our own origin
   with font-display: swap. Self-hosted, no request to Google at runtime. */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  axes: ["opsz"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-tight",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: `${copy.product.name} — watch the work, not just the answer`,
    template: `%s — ${copy.product.name}`,
  },
  description: copy.product.thesis,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0F14" },
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${interTight.variable} ${jetbrains.variable}`}
    >
      <head>
        {/* Runs before paint, so the theme never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-[6px] focus:border focus:px-3 focus:py-2 focus:text-[14px]"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          {copy.a11y.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
