// Emits <courseDir>/manifest.json: per-file sha256 + question counts, so the PWA can precache and detect content changes.
// Usage: npx tsx scripts/build-manifest.ts content/dva-c03
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const courseDir = process.argv[2];
if (!courseDir) throw new Error("usage: tsx scripts/build-manifest.ts <courseDir>");
const sha = (buf: Buffer | string) => "sha256:" + createHash("sha256").update(buf).digest("hex");

const course = JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8"));
const files: Record<string, { hash: string; questions?: number; sectionId?: string }> = {};
files["course.json"] = { hash: sha(readFileSync(join(courseDir, "course.json"))) };
if (existsSync(join(courseDir, "glossary.json"))) files["glossary.json"] = { hash: sha(readFileSync(join(courseDir, "glossary.json"))) };

let total = 0;
const perDomain: Record<string, number> = {};
for (const s of course.sections) {
  const p = join(courseDir, s.file);
  const raw = readFileSync(p);
  const data = JSON.parse(raw.toString("utf8"));
  const n = data.questions.filter((q: any) => !q.retired).length;
  total += n;
  perDomain[s.domainId] = (perDomain[s.domainId] ?? 0) + n;
  files[s.file] = { hash: sha(raw), questions: n, sectionId: s.id };
}
const mlDir = join(courseDir, "i18n", "ml");
if (existsSync(mlDir))
  for (const f of readdirSync(mlDir).filter((f) => f.endsWith(".json")))
    files[`i18n/ml/${f}`] = { hash: sha(readFileSync(join(mlDir, f))) };

// Keep the previous generatedAt when nothing else changed, so a no-op build leaves the tree clean.
const mPath = join(courseDir, "manifest.json");
const body = { totalQuestions: total, perDomain, files };
const prev = existsSync(mPath) ? JSON.parse(readFileSync(mPath, "utf8")) : null;
const unchanged = prev && JSON.stringify({ totalQuestions: prev.totalQuestions, perDomain: prev.perDomain, files: prev.files }) === JSON.stringify(body);
const manifest = { courseId: course.id, generatedAt: unchanged ? prev.generatedAt : new Date().toISOString(), ...body };
writeFileSync(mPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest: ${total} questions`, perDomain);
