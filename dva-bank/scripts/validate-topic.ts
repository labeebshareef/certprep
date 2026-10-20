// Validate a single topic file (schema + id/domain/task consistency). Used while authoring one file at a time.
// Usage: npx tsx scripts/validate-topic.ts content/dva-c03 topics/d1-lambda.json
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Course, TopicFile, TERM_TOKEN } from "../schema/content";

const [courseDir, rel] = process.argv.slice(2);
if (!courseDir || !rel) throw new Error("usage: tsx scripts/validate-topic.ts <courseDir> <topics/file.json>");
const course = Course.parse(JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")));
const section = course.sections.find((s) => s.file === rel);
const errors: string[] = [];
let raw: any;
try { raw = JSON.parse(readFileSync(join(courseDir, rel), "utf8")); } catch (e: any) { console.log(`ERROR invalid JSON: ${e.message}`); process.exit(1); }
const res = TopicFile.safeParse(raw);
if (!res.success) for (const i of res.error.issues) {
  const qi = i.path[1];
  const qid = typeof qi === "number" ? raw.questions?.[qi]?.id ?? `#${qi}` : "";
  errors.push(`${qid} ${i.path.join(".")}: ${i.message}`);
}
if (!section) errors.push(`no section in course.json points at ${rel}`);
if (res.success) {
  const t = res.data;
  if (section && t.sectionId !== section.id) errors.push(`sectionId ${t.sectionId} != ${section.id}`);
  const taskIds = new Set(course.domains.flatMap((d) => d.tasks.map((x) => x.id)));
  const ids = new Set<string>();
  const QUAL = /\b(MOST|LEAST|FEWEST|HIGHEST|LOWEST|BEST|FASTEST|minimal|minimum)\b/;
  let multi = 0, qual = 0;
  for (const q of t.questions) {
    if (ids.has(q.id)) errors.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    if (!q.id.startsWith(`${course.id}/${section?.id}/`)) errors.push(`${q.id}: id must start with ${course.id}/${section?.id}/`);
    if (section && q.domainId !== section.domainId) errors.push(`${q.id}: domainId ${q.domainId} != ${section.domainId}`);
    if (q.taskId && !taskIds.has(q.taskId)) errors.push(`${q.id}: unknown taskId ${q.taskId}`);
    if (q.taskId && q.taskId[0] !== q.domainId[1]) errors.push(`${q.id}: taskId ${q.taskId} not in ${q.domainId}`);
    for (const field of [q.stem, q.explanation, ...q.choices.flatMap((c) => [c.text, c.explanation])]) {
      const opens = (field.match(/\{\{/g) ?? []).length, closes = (field.match(/\}\}/g) ?? []).length, good = (field.match(TERM_TOKEN) ?? []).length;
      if (opens !== closes || opens !== good) errors.push(`${q.id}: malformed {{...}} token in "${field.slice(0, 60)}…"`);
    }
    if (q.type === "multi") multi++;
    if (QUAL.test(q.stem)) qual++;
  }
  console.log(`${t.questions.length} questions · ${multi} multi · qualifier in ${qual}`);
}
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
