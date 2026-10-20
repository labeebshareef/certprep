// Splits content text into plain runs and protected terms. {{t:...}} = service/feature name, {{code:...}} = identifier.
export type Segment = { kind: "text"; value: string } | { kind: "term" | "code"; value: string };

const TOKEN = /\{\{(t|code):([^{}]+)\}\}/g;

export function segments(s: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: "text", value: s.slice(last, m.index) });
    out.push({ kind: m[1] === "t" ? "term" : "code", value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", value: s.slice(last) });
  return out;
}

/** Plain-text version (for titles, issue links, aria labels). */
export function plain(s: string): string {
  return s.replace(TOKEN, "$2");
}
