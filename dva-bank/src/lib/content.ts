// Loads a course's JSON through the same Zod schema the CLI validator uses. Topic files and overlays are
// separate lazy chunks (so the service worker can precache them individually); course.json is eager.
import { Course, OverlayFile, TopicFile, type Question } from "../../schema/content";

export type CourseT = ReturnType<typeof Course.parse>;
export type QuestionT = Question;
export type SectionT = CourseT["sections"][number];
export type OverlayT = ReturnType<typeof OverlayFile.parse>;

export type GlossaryTerm = { term: string; short?: string; gloss?: string };

export type LoadedCourse = {
  course: CourseT;
  questions: QuestionT[]; // active (non-retired) questions in section order
  byId: Map<string, QuestionT>;
  sectionOf: Map<string, SectionT>;
  glossary: Map<string, GlossaryTerm>; // keyed by both term and short name
  overlays: Record<string, OverlayT>; // locale → merged overlay
};

const courseFiles = import.meta.glob<unknown>("/content/*/course.json", { eager: true, import: "default" });
const glossaryFiles = import.meta.glob<{ terms: GlossaryTerm[] }>("/content/*/glossary.json", { eager: true, import: "default" });
const topicFiles = import.meta.glob<unknown>("/content/*/topics/*.json", { import: "default" });
const overlayFiles = import.meta.glob<unknown>("/content/*/i18n/*/*.json", { import: "default" });

export function availableCourses(): string[] {
  return Object.keys(courseFiles).map((p) => p.split("/")[2]);
}

export async function loadCourse(courseId: string): Promise<LoadedCourse> {
  const raw = courseFiles[`/content/${courseId}/course.json`];
  if (!raw) throw new Error(`Unknown course ${courseId}`);
  const course = Course.parse(raw);

  const sections = [...course.sections].sort((a, b) => a.order - b.order);
  const topics = await Promise.all(
    sections.map(async (s) => {
      const load = topicFiles[`/content/${courseId}/${s.file}`];
      if (!load) throw new Error(`Missing topic file ${s.file}`);
      return { section: s, file: TopicFile.parse(await load()) };
    }),
  );

  const questions: QuestionT[] = [];
  const byId = new Map<string, QuestionT>();
  const sectionOf = new Map<string, SectionT>();
  for (const { section, file } of topics) {
    for (const q of file.questions) {
      byId.set(q.id, q); // retired ones stay resolvable so old attempts still render
      sectionOf.set(q.id, section);
      if (!q.retired) questions.push(q);
    }
  }

  const glossary = new Map<string, GlossaryTerm>();
  for (const t of glossaryFiles[`/content/${courseId}/glossary.json`]?.terms ?? []) {
    glossary.set(t.term, t);
    if (t.short) glossary.set(t.short, t);
  }

  const overlays: Record<string, OverlayT> = {};
  for (const [path, load] of Object.entries(overlayFiles)) {
    const [, , cid, , locale] = path.split("/");
    if (cid !== courseId) continue;
    const parsed = OverlayFile.safeParse(await load());
    if (!parsed.success) {
      console.warn(`Ignoring invalid overlay ${path}`, parsed.error.issues);
      continue;
    }
    overlays[locale] = { ...overlays[locale], ...parsed.data };
  }

  return { course: { ...course, sections }, questions, byId, sectionOf, glossary, overlays };
}

export type LocalizedQuestion = {
  lang: "en" | string;
  /** True when the user asked for another locale but this item fell back to English. */
  fallback: boolean;
  stem: string;
  explanation: string;
  choices: Record<string, { text: string; explanation: string }>;
};

/** Picks the overlay text for a question only if it was translated from the current English (sourceHash). */
export function localize(q: QuestionT, locale: string, overlays: LoadedCourse["overlays"], forceEnglish = false): LocalizedQuestion {
  const english: LocalizedQuestion = {
    lang: "en",
    fallback: locale !== "en",
    stem: q.stem,
    explanation: q.explanation,
    choices: Object.fromEntries(q.choices.map((c) => [c.id, { text: c.text, explanation: c.explanation }])),
  };
  if (locale === "en" || forceEnglish) return { ...english, fallback: false };
  const t = overlays[locale]?.[q.id];
  if (!t || t.sourceHash !== q.contentHash) return english;
  if (!q.choices.every((c) => t.choices[c.id])) return english;
  return { lang: locale, fallback: false, stem: t.stem, explanation: t.explanation, choices: t.choices };
}

export function correctIds(q: QuestionT): string[] {
  return q.choices.filter((c) => c.correct).map((c) => c.id);
}

export function isCorrect(q: QuestionT, selected: string[]): boolean {
  const want = correctIds(q).sort().join();
  return [...selected].sort().join() === want;
}
