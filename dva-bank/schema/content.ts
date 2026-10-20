import { z } from "zod";

// ---------- shared ----------
export const QUESTION_ID = /^[a-z0-9-]+\/[a-z0-9-]+\/\d{4}$/;
export const CHOICE_ID = /^[a-f]$/;

// Protected-term markers. {{t:...}} = AWS service / feature name, {{code:...}} = API, CLI flag, config key, error string.
export const TERM_TOKEN = /\{\{(t|code):([^{}]+)\}\}/g;

export const Reference = z.object({
  title: z.string().min(3),
  url: z.string().url(),
});

export const Choice = z.object({
  id: z.string().regex(CHOICE_ID),
  text: z.string().min(3),
  correct: z.boolean(),
  explanation: z.string().min(20),
});

export const Question = z
  .object({
    id: z.string().regex(QUESTION_ID),
    revision: z.number().int().min(1).default(1),
    changeKind: z.enum(["cosmetic", "material"]).default("material"),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(), // stamped by scripts/hash.ts
    type: z.enum(["single", "multi"]),
    selectCount: z.number().int().min(1).max(3).default(1),
    difficulty: z.number().int().min(1).max(3),
    domainId: z.enum(["d1", "d2", "d3", "d4"]),
    taskId: z.string().regex(/^[1-4]\.\d$/).optional(), // provisional until the C03 guide is published
    services: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    stem: z.string().min(40),
    choices: z.array(Choice).min(4).max(6),
    explanation: z.string().min(40),
    references: z.array(Reference).min(1),
    retired: z.boolean().default(false),
    meta: z
      .object({
        author: z.string().default("claude"),
        reviewed: z.boolean().default(false),
        createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .default({ author: "claude", reviewed: false, createdAt: "2026-10-20" }),
  })
  .superRefine((q, ctx) => {
    const correct = q.choices.filter((c) => c.correct).length;
    if (q.type === "single") {
      if (q.choices.length !== 4)
        ctx.addIssue({ code: "custom", message: `single must have exactly 4 choices (has ${q.choices.length})`, path: ["choices"] });
      if (correct !== 1)
        ctx.addIssue({ code: "custom", message: `single must have exactly 1 correct choice (has ${correct})`, path: ["choices"] });
      if (q.selectCount !== 1)
        ctx.addIssue({ code: "custom", message: "single must have selectCount 1", path: ["selectCount"] });
    } else {
      if (q.choices.length < 5)
        ctx.addIssue({ code: "custom", message: `multi must have at least 5 choices (has ${q.choices.length})`, path: ["choices"] });
      if (q.selectCount < 2)
        ctx.addIssue({ code: "custom", message: "multi must have selectCount >= 2", path: ["selectCount"] });
      if (correct !== q.selectCount)
        ctx.addIssue({ code: "custom", message: `multi: ${correct} correct choices but selectCount is ${q.selectCount}`, path: ["choices"] });
      if (!/choose (two|three)/i.test(q.stem))
        ctx.addIssue({ code: "custom", message: "multi stem must say 'Choose TWO' / 'Choose THREE'", path: ["stem"] });
    }
    const ids = q.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "duplicate choice ids", path: ["choices"] });
    const expectedIds = "abcdef".slice(0, q.choices.length).split("");
    if (ids.join("") !== expectedIds.join(""))
      ctx.addIssue({ code: "custom", message: `choice ids must be ${expectedIds.join(",")} in order`, path: ["choices"] });
    if (!/(\?|\(Choose (TWO|THREE)\.?\))\s*$/i.test(q.stem.trim()))
      ctx.addIssue({ code: "custom", message: "stem must end with '?' or '(Choose TWO.)' / '(Choose THREE.)'", path: ["stem"] });
  });

export const TopicFile = z.object({
  schemaVersion: z.literal(1),
  courseId: z.string(),
  sectionId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  questions: z.array(Question).min(1),
});

export const Task = z.object({ id: z.string(), title: z.string() });

export const Domain = z.object({
  id: z.enum(["d1", "d2", "d3", "d4"]),
  title: z.string(),
  weight: z.number().min(0).max(1),
  tasks: z.array(Task),
});

export const Section = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().int().min(1),
  domainId: z.enum(["d1", "d2", "d3", "d4"]),
  title: z.string(),
  file: z.string(),
  unlock: z.object({
    requires: z.array(z.string()).default([]),
    passPct: z.number().min(0).max(1).default(0.8),
    quizSize: z.number().int().min(5).default(10),
  }),
});

export const Course = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    title: z.string(),
    examCode: z.string(),
    examGuideStatus: z.enum(["provisional", "official"]),
    examGuideVersion: z.string().optional(),
    notes: z.string().optional(),
    passingScaled: z.number().int(),
    questionsOnExam: z.number().int(),
    minutes: z.number().int(),
    domains: z.array(Domain).length(4),
    sections: z.array(Section).min(1),
    locales: z.array(z.string()).default(["en"]),
    glossary: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const sum = c.domains.reduce((a, d) => a + d.weight, 0);
    if (Math.abs(sum - 1) > 0.001)
      ctx.addIssue({ code: "custom", message: `domain weights sum to ${sum}, expected 1`, path: ["domains"] });
    const ids = new Set(c.sections.map((s) => s.id));
    for (const s of c.sections)
      for (const r of s.unlock.requires)
        if (!ids.has(r))
          ctx.addIssue({ code: "custom", message: `section ${s.id} requires unknown section ${r}`, path: ["sections"] });
  });

// Malayalam overlay: keyed by question id, same token multiset as the English source.
export const TranslatedChoice = z.object({ text: z.string(), explanation: z.string() });
export const TranslatedQuestion = z.object({
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  stem: z.string(),
  choices: z.record(z.string().regex(CHOICE_ID), TranslatedChoice),
  explanation: z.string(),
  meta: z.object({ translator: z.string(), reviewed: z.boolean() }),
});
export const OverlayFile = z.record(z.string().regex(QUESTION_ID), TranslatedQuestion);

export type Question = z.infer<typeof Question>;
export type TopicFile = z.infer<typeof TopicFile>;
export type Course = z.infer<typeof Course>;
export type OverlayFile = z.infer<typeof OverlayFile>;
