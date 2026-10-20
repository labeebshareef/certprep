// Session planning and the in-session queue. Pure functions over the snapshot + content.
import type { AttemptRow, ReviewStateRow, SectionProgressRow } from "./database.types";
import type { LoadedCourse, QuestionT, SectionT } from "./content";
import { retrievability, State } from "./scheduler";
import { endOfLocalDay, localDate, type DayClock } from "./time";
import { forecast, latestAttempts, newIntroducedOn } from "./stats";
import { MINUTE, shuffle } from "./utils";

export const SOFT_STOP_MS = 25 * MINUTE; // stop introducing new questions
export const HARD_STOP_MS = 30 * MINUTE; // end the session
export const RELEARN_GAP = 5; // a missed question comes back at least this many items later, once
export const LOAD_BALANCE_DUE = 40; // halve today's new cap if tomorrow already has this many reviews

// ---------- gating ----------

export function isPassed(p?: SectionProgressRow) {
  return !!p?.passed_at;
}

export function unlockedSections(content: LoadedCourse, progress: Record<string, SectionProgressRow>): SectionT[] {
  return content.course.sections.filter((s) => s.unlock.requires.every((r) => isPassed(progress[r])));
}

// ---------- ordering helpers ----------

/** Keeps the given order but avoids two consecutive items from the same group when an alternative is close. */
export function interleave<T>(items: T[], group: (t: T) => string, lookahead = 6): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length) {
    const last = out.length ? group(out[out.length - 1]) : null;
    let pick = 0;
    if (last !== null && group(rest[0]) === last) {
      const alt = rest.slice(0, lookahead).findIndex((t) => group(t) !== last);
      if (alt > 0) pick = alt;
    }
    out.push(rest.splice(pick, 1)[0]);
  }
  return out;
}

/** Round-robin across groups, preserving each group's internal order. */
export function roundRobin<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const qs = groups.map((g) => [...g]);
  while (qs.some((g) => g.length)) for (const g of qs) if (g.length) out.push(g.shift()!);
  return out;
}

// ---------- daily plan ----------

export type PlanItem = { qid: string; kind: "due" | "new" | "relearn" };
export type DailyPlan = { items: PlanItem[]; due: number; fresh: number; newCap: number; loadBalanced: boolean };

export function planDaily(args: {
  content: LoadedCourse;
  states: Record<string, ReviewStateRow>;
  progress: Record<string, SectionProgressRow>;
  attempts: AttemptRow[];
  newPerDay: number;
  retention: number;
  clock: DayClock;
  now: Date;
}): DailyPlan {
  const { content, states, now, clock } = args;
  const end = endOfLocalDay(now, clock).getTime();
  const active = (qid: string) => {
    const q = content.byId.get(qid);
    return !!q && !q.retired;
  };

  const due = Object.values(states)
    .filter((s) => !s.suspended && s.state !== State.New && active(s.question_id) && new Date(s.due).getTime() < end)
    .map((s) => ({ s, r: retrievability(s, now, args.retention) }))
    .sort((a, b) => a.r - b.r || a.s.due.localeCompare(b.s.due))
    .map((x) => x.s.question_id);
  const sectionKey = (qid: string) => content.sectionOf.get(qid)?.id ?? "";
  const dueOrdered = interleave(due, sectionKey);

  // new-question budget
  const today = localDate(now, clock);
  const tomorrow = forecast(states, now, clock, 2)[1]?.due ?? 0;
  const loadBalanced = tomorrow > LOAD_BALANCE_DUE;
  const baseCap = loadBalanced ? Math.floor(args.newPerDay / 2) : args.newPerDay;
  const newCap = Math.max(0, baseCap - newIntroducedOn(args.attempts, today));

  const seen = (q: QuestionT) => {
    const s = states[q.id];
    return !!s && s.state !== State.New;
  };
  const groups = unlockedSections(content, args.progress)
    .map((sec) => content.questions.filter((q) => content.sectionOf.get(q.id)?.id === sec.id && !seen(q)))
    .filter((g) => g.length)
    .slice(0, 3); // interleave the 2–3 earliest unlocked sections that still have new material
  const fresh = roundRobin(groups).slice(0, newCap).map((q) => q.id);

  return {
    items: [...dueOrdered.map((qid) => ({ qid, kind: "due" as const })), ...fresh.map((qid) => ({ qid, kind: "new" as const }))],
    due: dueOrdered.length,
    fresh: fresh.length,
    newCap,
    loadBalanced,
  };
}

// ---------- in-session queue ----------

export type Queue = { items: PlanItem[]; index: number; relearned: string[] };

export function startQueue(items: PlanItem[]): Queue {
  return { items, index: 0, relearned: [] };
}

export function current(q: Queue): PlanItem | undefined {
  return q.items[q.index];
}

/** Advance after an answer. Wrong answers in daily/review sessions re-enter once, ≥ RELEARN_GAP items later. */
export function advance(q: Queue, opts: { wrong: boolean; relearn: boolean; elapsedMs: number }): { queue: Queue; done: boolean; reason?: "finished" | "time" } {
  const item = q.items[q.index];
  let items = q.items;
  let relearned = q.relearned;
  if (opts.wrong && opts.relearn && item && !relearned.includes(item.qid)) {
    items = [...items];
    const at = Math.min(items.length, q.index + 1 + RELEARN_GAP);
    items.splice(at, 0, { qid: item.qid, kind: "relearn" });
    relearned = [...relearned, item.qid];
  }
  let index = q.index + 1;
  if (opts.elapsedMs >= HARD_STOP_MS) return { queue: { items, index, relearned }, done: true, reason: "time" };
  if (opts.elapsedMs >= SOFT_STOP_MS) {
    // past the soft stop: drop new questions that haven't been shown yet (reviews and relearns stay)
    items = [...items.slice(0, index), ...items.slice(index).filter((i) => i.kind !== "new")];
  }
  const queue = { items, index, relearned };
  return index >= items.length ? { queue, done: true, reason: "finished" } : { queue, done: false };
}

// ---------- section quiz ----------

export function planQuiz(content: LoadedCourse, section: SectionT): string[] {
  const qs = content.questions.filter((q) => content.sectionOf.get(q.id)?.id === section.id);
  return shuffle(qs).slice(0, section.unlock.quizSize).map((q) => q.id);
}

// ---------- weak-spot review ----------

export type ReviewFocus = "confident-wrong" | "recent-wrong";

/** Questions whose latest attempt was a confident error, or that still have a pending re-check. */
export function confidentWrongIds(content: LoadedCourse, attempts: AttemptRow[], states: Record<string, ReviewStateRow>): string[] {
  const latest = latestAttempts(attempts);
  const ids = new Set<string>();
  for (const [qid, a] of latest) if (!a.correct && a.confidence === "sure") ids.add(qid);
  for (const s of Object.values(states)) if (s.recheck_by && !s.suspended) ids.add(s.question_id);
  return [...ids].filter((id) => content.byId.get(id) && !content.byId.get(id)!.retired);
}

export function recentWrongIds(content: LoadedCourse, attempts: AttemptRow[], limit = 20): string[] {
  const latest = latestAttempts(attempts);
  return [...latest.values()]
    .filter((a) => !a.correct && content.byId.get(a.question_id) && !content.byId.get(a.question_id)!.retired)
    .sort((a, b) => b.answered_at.localeCompare(a.answered_at))
    .slice(0, limit)
    .map((a) => a.question_id);
}

// ---------- mock exam ----------

export const MOCK_QUESTIONS = 65;

/** Samples questions across the whole bank in proportion to domain weights (largest-remainder rounding). */
export function planMock(content: LoadedCourse, size = MOCK_QUESTIONS, rand: () => number = Math.random): string[] {
  const total = Math.min(size, content.questions.length);
  const domains = content.course.domains.map((d) => ({ d, pool: shuffle(content.questions.filter((q) => q.domainId === d.id), rand) }));
  const raw = domains.map(({ d, pool }) => ({ want: d.weight * total, pool }));
  const alloc = raw.map((x) => Math.min(x.pool.length, Math.floor(x.want)));
  let left = total - alloc.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, rem: x.want - Math.floor(x.want) })).sort((a, b) => b.rem - a.rem);
  while (left > 0) {
    let progressed = false;
    for (const { i } of order) {
      if (left > 0 && alloc[i] < raw[i].pool.length) {
        alloc[i]++;
        left--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return shuffle(raw.flatMap((x, i) => x.pool.slice(0, alloc[i]).map((q) => q.id)), rand);
}

/** Rough scaled-score estimate for display only: linear 100–1000. AWS's real scaling is not published. */
export function scaledEstimate(pct: number): number {
  return Math.round(100 + 900 * pct);
}
