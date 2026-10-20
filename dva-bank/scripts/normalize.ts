// One-off style normaliser: every multi stem ends with "...? (Choose TWO.)" / "(Choose THREE.)", wherever the writer put it.
// Usage: npx tsx scripts/normalize.ts content/dva-c03
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const courseDir = process.argv[2];
if (!courseDir) throw new Error("usage: tsx scripts/normalize.ts <courseDir>");
const dir = join(courseDir, "topics");
let fixed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const p = join(dir, f);
  const data = JSON.parse(readFileSync(p, "utf8"));
  let dirty = false;
  for (const q of data.questions) {
    if (q.type !== "multi") continue;
    const word = q.selectCount === 3 ? "THREE" : "TWO";
    let stem: string = q.stem.trim();
    // strip any existing "(Choose TWO)" / "(Choose TWO.)" with surrounding spaces
    stem = stem.replace(/\s*\(Choose (TWO|THREE)\.?\)\s*/gi, " ").replace(/\s{2,}/g, " ").replace(/\s+\?/g, "?").trim();
    if (!stem.endsWith("?")) stem += "?";
    stem = `${stem} (Choose ${word}.)`;
    if (stem !== q.stem) { q.stem = stem; dirty = true; fixed++; }
  }
  if (dirty) writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}
console.log(`normalize: ${fixed} multi stems rewritten`);
