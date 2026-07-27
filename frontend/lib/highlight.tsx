import type { ReactNode } from "react";

/* ===========================================================================
   A 70-line tokeniser for SQL and Python.

   Deliberately not shiki or highlight.js. Both ship a theme we would then have
   to fight, and shiki drags in WASM for two languages we control completely.
   Rolling our own means every token colour is one of the palette variables,
   so code reads as part of the instrument panel rather than as a pasted
   screenshot from someone else's editor.
   =========================================================================== */

type TokenKind = "kw" | "fn" | "str" | "num" | "com" | "op" | "txt";

const TOKEN_COLOR: Record<TokenKind, string> = {
  kw: "var(--supervisor-on-surface)",
  fn: "var(--retriever-on-surface)",
  str: "var(--web-on-surface)",
  num: "var(--data-on-surface)",
  com: "var(--text-faint)",
  op: "var(--text-muted)",
  txt: "var(--text)",
};

const SQL_KEYWORDS = new Set(
  `select from where group by order having limit offset join left right inner outer full on as and or not in is null distinct union all case when then else end with insert update delete create drop alter between like asc desc count sum avg min max round coalesce cast`.split(
    /\s+/,
  ),
);

const PY_KEYWORDS = new Set(
  `def class return if elif else for while in not and or is None True False import from as with try except finally raise lambda yield global nonlocal pass break continue assert del async await print`.split(
    /\s+/,
  ),
);

interface Token {
  kind: TokenKind;
  value: string;
}

function tokenize(source: string, lang: "sql" | "python"): Token[] {
  const keywords = lang === "sql" ? SQL_KEYWORDS : PY_KEYWORDS;
  const commentStart = lang === "sql" ? "--" : "#";
  const tokens: Token[] = [];

  let i = 0;
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    const lower = buffer.toLowerCase();
    if (keywords.has(lower)) tokens.push({ kind: "kw", value: buffer });
    else if (/^\d[\d_.]*$/.test(buffer)) tokens.push({ kind: "num", value: buffer });
    else tokens.push({ kind: "txt", value: buffer });
    buffer = "";
  };

  while (i < source.length) {
    const ch = source[i]!;
    const rest = source.slice(i);

    // Comment to end of line
    if (rest.startsWith(commentStart)) {
      flush();
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      tokens.push({ kind: "com", value: source.slice(i, stop) });
      i = stop;
      continue;
    }

    // String literal (single, double, or triple)
    if (ch === '"' || ch === "'") {
      flush();
      const triple = rest.slice(0, 3);
      const isTriple = triple === '"""' || triple === "'''";
      const delim = isTriple ? triple : ch;
      const from = i + delim.length;
      let end = source.indexOf(delim, from);
      if (end === -1) end = source.length;
      else end += delim.length;
      tokens.push({ kind: "str", value: source.slice(i, end) });
      i = end;
      continue;
    }

    // Identifier / number
    if (/[A-Za-z0-9_.]/.test(ch)) {
      buffer += ch;
      i += 1;
      continue;
    }

    flush();

    // Function call: name immediately followed by (
    if (ch === "(" && tokens.length > 0) {
      const prev = tokens[tokens.length - 1]!;
      if (prev.kind === "txt" && /^[A-Za-z_]\w*$/.test(prev.value)) prev.kind = "fn";
    }

    tokens.push({ kind: /[\s]/.test(ch) ? "txt" : "op", value: ch });
    i += 1;
  }

  flush();
  return tokens;
}

/**
 * Render highlighted source. Whitespace is preserved by the caller's <pre>.
 * Returns plain nodes — no dangerouslySetInnerHTML anywhere.
 */
export function highlight(source: string, lang: "sql" | "python"): ReactNode {
  const tokens = tokenize(source, lang);
  return tokens.map((token, index) =>
    token.kind === "txt" ? (
      token.value
    ) : (
      <span key={index} style={{ color: TOKEN_COLOR[token.kind] }}>
        {token.value}
      </span>
    ),
  );
}
