// Validates a course folder: course.json, every topic file, cross-file invariants, and the ml overlay (if present).
// Usage: npx tsx scripts/validate.ts content/dva-c03
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Course, OverlayFile, TopicFile, TERM_TOKEN } from "../schema/content";
import { hashQuestion } from "./hash";

const courseDir = process.argv[2];
if (!courseDir) throw new Error("usage: tsx scripts/validate.ts <courseDir>");

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

function tokens(s: string): string[] {
  return [...s.matchAll(TERM_TOKEN)].map((m) => `${m[1]}:${m[2]}`).sort();
}

// ---- course.json
const courseRaw = JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8"));
const courseRes = Course.safeParse(courseRaw);
if (!courseRes.success) {
  for (const i of courseRes.error.issues) err(`course.json ${i.path.join(".")}: ${i.message}`);
  report();
}
const course = courseRes.data!;
const taskIds = new Set(course.domains.flatMap((d) => d.tasks.map((t) => t.id)));
const sectionById = new Map(course.sections.map((s) => [s.id, s]));

// ---- topic files
const seenIds = new Map<string, string>();
const stats = { questions: 0, multi: 0, qualifier: 0, byDomain: {} as Record<string, number>, byService: {} as Record<string, number>, byDifficulty: {} as Record<string, number> };
const QUALIFIER = /\b(MOST|LEAST|FEWEST|HIGHEST|LOWEST|BEST|FASTEST|minimal|minimum)\b/;

const topicFiles = readdirSync(join(courseDir, "topics")).filter((f) => f.endsWith(".json"));
const englishById = new Map<string, any>();

for (const f of topicFiles) {
  const p = join(courseDir, "topics", f);
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch (e: any) {
    err(`${f}: invalid JSON: ${e.message}`);
    continue;
  }
  const res = TopicFile.safeParse(raw);
  if (!res.success) {
    for (const i of res.error.issues) {
      const qi = i.path[1];
      const qid = typeof qi === "number" ? raw.questions?.[qi]?.id ?? `#${qi}` : "";
      err(`${f} ${qid} ${i.path.join(".")}: ${i.message}`);
    }
    continue;
  }
  const topic = res.data;
  if (topic.courseId !== course.id) err(`${f}: courseId ${topic.courseId} != ${course.id}`);
  const section = sectionById.get(topic.sectionId);
  if (!section) err(`${f}: sectionId ${topic.sectionId} not in course.json`);
  else if (section.file !== `topics/${f}`) err(`${f}: course.json section ${section.id} points at ${section.file}`);

  for (const q of topic.questions) {
    stats.questions++;
    const [cid, topicSlug] = q.id.split("/");
    if (cid !== course.id) err(`${q.id}: id prefix must be ${course.id}`);
    if (topicSlug !== topic.sectionId) err(`${q.id}: id section must be ${topic.sectionId}`);
    if (seenIds.has(q.id)) err(`${q.id}: duplicate id (also in ${seenIds.get(q.id)})`);
    seenIds.set(q.id, f);
    englishById.set(q.id, q);
    if (section && q.domainId !== section.domainId) err(`${q.id}: domainId ${q.domainId} != section domain ${section.domainId}`);
    if (q.taskId && !taskIds.has(q.taskId)) err(`${q.id}: unknown taskId ${q.taskId}`);
    if (q.taskId && q.taskId[0] !== q.domainId[1]) err(`${q.id}: taskId ${q.taskId} not in domain ${q.domainId}`);
    if (q.contentHash && q.contentHash !== hashQuestion(q)) err(`${q.id}: contentHash stale – run scripts/hash.ts`);
    if (!q.contentHash) warn(`${q.id}: no contentHash yet – run scripts/hash.ts`);
    if (q.type === "multi") stats.multi++;
    if (QUALIFIER.test(q.stem)) stats.qualifier++;
    stats.byDomain[q.domainId] = (stats.byDomain[q.domainId] ?? 0) + 1;
    stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] ?? 0) + 1;
    for (const s of q.services) stats.byService[s] = (stats.byService[s] ?? 0) + 1;

    // unbalanced or malformed tokens
    for (const field of [q.stem, q.explanation, ...q.choices.flatMap((c) => [c.text, c.explanation])]) {
      const opens = (field.match(/\{\{/g) ?? []).length;
      const closes = (field.match(/\}\}/g) ?? []).length;
      const good = (field.match(TERM_TOKEN) ?? []).length;
      if (opens !== closes || opens !== good) err(`${q.id}: malformed {{...}} token in "${field.slice(0, 60)}…"`);
    }
    // correct choices should not be systematically longest (classic tell)
    const lens = q.choices.map((c) => c.text.length);
    const maxLen = Math.max(...lens);
    const correctIsLongest = q.choices.filter((c) => c.correct).every((c) => c.text.length === maxLen);
    if (q.type === "single" && correctIsLongest && maxLen > 1.5 * Math.min(...lens)) warn(`${q.id}: correct answer is by far the longest choice`);
    for (const r of q.references) if (!/^https:\/\/(docs\.aws\.amazon\.com|aws\.amazon\.com)\//.test(r.url)) warn(`${q.id}: non-AWS reference ${r.url}`);
  }
}

for (const s of course.sections) if (!topicFiles.includes(s.file.replace(/^topics\//, ""))) err(`course.json section ${s.id}: file ${s.file} missing`);

// ---- ml overlay (optional)
const mlDir = join(courseDir, "i18n", "ml");
if (existsSync(mlDir)) {
  for (const f of readdirSync(mlDir).filter((f) => f.endsWith(".json"))) {
    const res = OverlayFile.safeParse(JSON.parse(readFileSync(join(mlDir, f), "utf8")));
    if (!res.success) {
      for (const i of res.error.issues) err(`i18n/ml/${f} ${i.path.join(".")}: ${i.message}`);
      continue;
    }
    for (const [id, t] of Object.entries(res.data)) {
      const en = englishById.get(id);
      if (!en) { err(`i18n/ml/${f}: ${id} not in English bank`); continue; }
      if (t.sourceHash !== en.contentHash) warn(`i18n/ml/${f}: ${id} translation stale (sourceHash mismatch) – will fall back to English`);
      const check = (label: string, enText: string, mlText: string) => {
        if (tokens(enText).join("|") !== tokens(mlText).join("|")) err(`i18n/ml/${f}: ${id} ${label}: protected-term tokens differ from English`);
        const stray = mlText.replace(TERM_TOKEN, "").match(/[A-Za-z]{4,}/g);
        if (stray) warn(`i18n/ml/${f}: ${id} ${label}: untagged Latin text "${stray.slice(0, 3).join(", ")}"`);
      };
      check("stem", en.stem, t.stem);
      check("explanation", en.explanation, t.explanation);
      for (const c of en.choices) {
        const tc = t.choices[c.id];
        if (!tc) { err(`i18n/ml/${f}: ${id} missing choice ${c.id}`); continue; }
        check(`choice ${c.id}`, c.text, tc.text);
        check(`choice ${c.id} explanation`, c.explanation, tc.explanation);
      }
    }
  }
}

report();

function report(): never {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\n${stats.questions} questions · ${stats.multi} multi-response (${pct(stats.multi, stats.questions)}) · qualifier in ${pct(stats.qualifier, stats.questions)} of stems`);
  console.log(`by domain: ${JSON.stringify(stats.byDomain)}  by difficulty: ${JSON.stringify(stats.byDifficulty)}`);
  console.log(`by service: ${Object.entries(stats.byService).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
function pct(a: number, b: number) { return b ? Math.round((100 * a) / b) + "%" : "0%"; }
