// Merges every {{t:...}} token actually used in the bank into glossary.json (keeps existing gloss/short values).
// Usage: npx tsx scripts/build-glossary.ts content/dva-c03
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const courseDir = process.argv[2];
if (!courseDir) throw new Error("usage: tsx scripts/build-glossary.ts <courseDir>");
const gPath = join(courseDir, "glossary.json");
const glossary = JSON.parse(readFileSync(gPath, "utf8"));
const byTerm = new Map<string, any>(glossary.terms.map((t: any) => [t.term, t]));
const usage = new Map<string, number>();
for (const f of readdirSync(join(courseDir, "topics")).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(courseDir, "topics", f), "utf8"));
  for (const q of d.questions)
    for (const s of [q.stem, q.explanation, ...q.choices.flatMap((c: any) => [c.text, c.explanation])])
      for (const m of s.matchAll(/\{\{t:([^}]+)\}\}/g)) usage.set(m[1], (usage.get(m[1]) ?? 0) + 1);
}
let added = 0;
for (const [term, count] of usage) {
  const existing = byTerm.get(term) ?? [...byTerm.values()].find((t) => t.short === term);
  if (existing) { existing.uses = (existing.uses ?? 0) + count; continue; }
  byTerm.set(term, { term, gloss: "", uses: count });
  added++;
}
glossary.terms = [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term));
writeFileSync(gPath, JSON.stringify(glossary, null, 2) + "\n");
console.log(`glossary: ${glossary.terms.length} terms (${added} added from usage)`);
