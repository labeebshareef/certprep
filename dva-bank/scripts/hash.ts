// Stamps contentHash on every question. Hash covers the English stem, choices (id, text, correct) sorted by id,
// and the overall explanation. Tags, difficulty, references and meta are excluded so retagging never resets review state.
// Usage: npx tsx scripts/hash.ts content/dva-c03   (idempotent; prints what changed)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function canonical(q: any): string {
  const choices = [...q.choices]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, text: c.text.trim(), correct: !!c.correct, explanation: c.explanation.trim() }));
  return JSON.stringify({ stem: q.stem.trim(), type: q.type, selectCount: q.selectCount ?? 1, choices, explanation: q.explanation.trim() });
}

export function hashQuestion(q: any): string {
  return "sha256:" + createHash("sha256").update(canonical(q)).digest("hex");
}

if (process.argv[1]?.endsWith("hash.ts")) {
  const courseDir = process.argv[2];
  if (!courseDir) throw new Error("usage: tsx scripts/hash.ts <courseDir>");
  const topicsDir = join(courseDir, "topics");
  let changed = 0, total = 0;
  for (const f of readdirSync(topicsDir).filter((f) => f.endsWith(".json"))) {
    const p = join(topicsDir, f);
    const data = JSON.parse(readFileSync(p, "utf8"));
    let dirty = false;
    for (const q of data.questions) {
      total++;
      const h = hashQuestion(q);
      if (q.contentHash !== h) {
        if (q.contentHash) console.log(`  ${q.id}: hash changed (${q.changeKind ?? "material"})`);
        q.contentHash = h;
        dirty = true;
        changed++;
      }
    }
    if (dirty) writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`hash: ${total} questions, ${changed} stamped/updated`);
}
