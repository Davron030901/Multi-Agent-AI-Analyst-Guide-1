"use client";

/* ===========================================================================
   Skeletons shaped like the content they replace.

   A grey bar tells you nothing. A rail skeleton with a dot column, a short
   mono label and two body lines tells you exactly what is about to appear —
   and because it occupies the same box, nothing shifts when it does.
   =========================================================================== */

export function RailSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="relative grid grid-cols-[28px_1fr] gap-x-2">
          <div className="relative flex justify-center pt-[7px]">
            <span
              className="block h-[8px] w-[8px] rounded-full"
              style={{ background: "var(--rail-idle)" }}
            />
            {i < rows - 1 && (
              <span
                className="absolute top-[15px] h-full w-[2px]"
                style={{ left: 12, background: "var(--rail-idle)" }}
              />
            )}
          </div>
          <div className="pb-5">
            <span
              className="shimmer block h-[11px] rounded-[3px]"
              style={{ width: `${86 + i * 22}px` }}
            />
            <span
              className="shimmer mt-2 block h-[13px] rounded-[3px]"
              style={{ width: `${62 - i * 8}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnswerSkeleton() {
  return (
    <div
      aria-hidden
      className="panel px-4 py-3.5"
      style={{ borderLeft: "2px solid var(--rail-idle)" }}
    >
      <span
        className="shimmer block h-[20px] w-[92px] rounded-[999px]"
        style={{ background: "var(--surface-2)" }}
      />
      <div className="mt-3 space-y-2">
        {["96%", "88%", "72%"].map((w) => (
          <span key={w} className="shimmer block h-[13px] rounded-[3px]" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {["58%", "44%"].map((w) => (
          <span key={w} className="shimmer block h-[13px] rounded-[3px]" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-2 p-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[6px] border px-2.5 py-2"
          style={{ borderColor: "var(--line)", borderLeft: "2px solid var(--rail-idle)" }}
        >
          <span className="shimmer block h-[13px] w-[64%] rounded-[3px]" />
          <span className="shimmer mt-1.5 block h-[11px] w-[38%] rounded-[3px]" />
          <span className="shimmer mt-2 block h-[11px] w-[92%] rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}
