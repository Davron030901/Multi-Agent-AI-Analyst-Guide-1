"use client";

import { ShieldAlert } from "lucide-react";
import { highlight } from "@/lib/highlight";
import { copy } from "@/lib/copy";
import type { SqlResult } from "@/lib/events";

export function SqlResultView({
  result,
  dense = false,
}: {
  result: SqlResult & { rawTail?: string };
  dense?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {result.rejected && (
        <div
          className="flex items-start gap-2 rounded-[6px] border px-2.5 py-2"
          style={{ borderColor: "var(--error)", background: "transparent" }}
        >
          <ShieldAlert
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 flex-none"
            style={{ color: "var(--error-on-surface)" }}
          />
          <div className="min-w-0">
            <p
              className="label-micro"
              style={{ color: "var(--error-on-surface)" }}
            >
              BLOCKED BY THE READ-ONLY GUARD
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
              {result.rejectionReason ?? copy.errors.sqlRejected.body}
            </p>
          </div>
        </div>
      )}

      <figure className="overflow-hidden rounded-[6px] border border-[var(--line)]">
        <figcaption
          className="label-micro flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5"
          style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
        >
          <span>QUERY</span>
          <span style={{ color: "var(--data-on-surface)" }}>SQLITE · READ-ONLY</span>
        </figcaption>
        <pre
          className="overflow-x-auto px-2.5 py-2 font-mono text-[12px] leading-[1.65]"
          style={{ background: "var(--surface)", tabSize: 2 }}
        >
          <code>{highlight(result.query, "sql")}</code>
        </pre>
      </figure>

      {result.rows.length > 0 && (
        <figure className="overflow-hidden rounded-[6px] border border-[var(--line)]">
          <figcaption
            className="label-micro flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5"
            style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
          >
            <span>RESULT</span>
            <span className="tnum">{copy.panel.rowCount(result.rowCount)}</span>
          </figcaption>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[12px]">
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="label-micro whitespace-nowrap border-b border-[var(--line)] px-2.5 py-1.5 text-left"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="transition-colors duration-[var(--dur-hover)] hover:bg-[var(--surface-2)]"
                  >
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={[
                          "whitespace-nowrap border-b border-[var(--line)] px-2.5 py-1.5",
                          typeof cell === "number" ? "tnum text-right" : "text-left",
                        ].join(" ")}
                        style={{
                          color: typeof cell === "number" ? "var(--text)" : "var(--text-muted)",
                          borderBottomWidth: i === result.rows.length - 1 ? 0 : 1,
                        }}
                      >
                        {cell === null ? (
                          <span style={{ color: "var(--text-faint)" }}>NULL</span>
                        ) : typeof cell === "number" ? (
                          cell.toLocaleString("en-US", { maximumFractionDigits: 2 })
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )}

      {!dense && result.rawTail && result.rows.length === 0 && (
        <pre
          className="overflow-x-auto rounded-[6px] border border-[var(--line)] px-2.5 py-2 font-mono text-[12px] leading-[1.6]"
          style={{ background: "var(--surface)", color: "var(--text-muted)" }}
        >
          {result.rawTail}
        </pre>
      )}
    </div>
  );
}
