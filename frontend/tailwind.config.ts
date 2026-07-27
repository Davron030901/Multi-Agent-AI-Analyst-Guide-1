import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // One colour per agent, reused by the trace timeline and the chips.
        supervisor: "#6366f1",
        retriever: "#0ea5e9",
        web: "#14b8a6",
        data: "#f59e0b",
        code: "#a855f7",
        critic: "#ef4444",
        generate: "#64748b",
      },
      keyframes: {
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(99,102,241,0.5)" },
          "70%": { boxShadow: "0 0 0 8px rgba(99,102,241,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
