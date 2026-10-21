// FSRS wrapper. Every scheduling decision the app makes goes through applyAnswer(), including rebuilds, so a
// review_states row can always be regenerated from the attempts log.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { AttemptRow, ReviewStateRow } from "./database.types";
import type { QuestionT } from "./content";
import { DAY } from "./utils";

export { Rating, State };

export const LEECH_LAPSES = 4;
export const RECHECK_DAYS = 3; // confident-wrong items come back within this many days regardless of interval
export const MAX_INTERVAL_DAYS = 180; // exam horizon

export type Confidence = "sure" | "unsure";
export type Mode = "daily" | "section_quiz" | "mock" | "review";

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
export function scheduler(retention = 0.9) {
  let s = schedulers.get(retention);
  if (!s) {
    s = fsrs(
      generatorParameters({
        request_retention: retention,
        maximum_interval: MAX_INTERVAL_DAYS,
        enable_fuzz: true,
        enable_short_term: true,
        learning_steps: ["10m"], // the default ['1m','10m'] is too twitchy for MCQs
        relearning_steps: ["10m"],
      }),
    );
    schedulers.set(retention, s);
  }
  return s;
}

/** wrong → Again; right + unsure → Hard; right + sure → Good. No Easy in v1. */
export function ratingFor(correct: boolean, confidence: Confidence): Grade {
  if (!correct) return Rating.Again;
  return confidence === "unsure" ? Rating.Hard : Rating.Good;
}

export function toCard(s: ReviewStateRow): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

function fromCard(card: Card, base: Pick<ReviewStateRow, "user_id" | "question_id" | "course_id" | "content_hash">, extra: Partial<ReviewStateRow>, now: Date): ReviewStateRow {
  return {
    ...base,
    state: card.state,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.toISOString() : null,
    is_leech: false,
    suspended: false,
    recheck_by: null,
    ...extra,
    updated_at: now.toISOString(),
  };
}

export function newState(userId: string, q: QuestionT, courseId: string, now: Date): ReviewStateRow {
  return fromCard(createEmptyCard(now), { user_id: userId, question_id: q.id, course_id: courseId, content_hash: q.contentHash ?? "" }, {}, now);
}

export type AnswerInput = { correct: boolean; confidence: Confidence; mode: Mode; now: Date; retention?: number };

/**
 * Applies one answer. Returns the new state (or the old one unchanged for mock attempts, which are measured
 * but never scheduled) and the rating that was used.
 */
export function applyAnswer(prev: ReviewStateRow, input: AnswerInput): { state: ReviewStateRow; rating: Grade } {
  const rating = ratingFor(input.correct, input.confidence);
  if (input.mode === "mock") return { state: prev, rating };

  const now = input.now;
  const { card } = scheduler(input.retention).next(toCard(prev), now, rating);
  let recheck = prev.recheck_by;

  if (!input.correct && input.confidence === "sure") {
    recheck = new Date(now.getTime() + RECHECK_DAYS * DAY).toISOString();
  } else if (recheck && input.correct) {
    const flaggedAt = new Date(recheck).getTime() - RECHECK_DAYS * DAY;
    if (now.getTime() - flaggedAt >= DAY) {
      recheck = null; // passed a delayed re-test: the confident error is corrected
    } else if (card.due.getTime() > new Date(recheck).getTime()) {
      card.due = new Date(recheck); // same-day relearn: still make it come back within the window
    }
  }

  const becameLeech = card.lapses >= LEECH_LAPSES && !prev.is_leech;
  return {
    rating,
    state: fromCard(card, prev, {
      recheck_by: recheck,
      is_leech: prev.is_leech || becameLeech,
      suspended: prev.suspended || becameLeech,
    }, now),
  };
}

/**
 * Content changed since this card was scheduled: material edits reset the card (the old memory is for a
 * different question), cosmetic edits only adopt the new hash. Returns null when nothing changed.
 */
export function reconcile(s: ReviewStateRow, q: QuestionT, now: Date): ReviewStateRow | null {
  const hash = q.contentHash ?? "";
  if (s.content_hash === hash) return null;
  if (q.changeKind === "cosmetic") return { ...s, content_hash: hash, updated_at: now.toISOString() };
  return newState(s.user_id, q, s.course_id, now);
}

/** Resets a leech (or any card) to New and puts it back in rotation. */
export function resetCard(s: ReviewStateRow, q: QuestionT, now: Date): ReviewStateRow {
  return newState(s.user_id, q, s.course_id, now);
}

export function retrievability(s: ReviewStateRow, now: Date, retention = 0.9): number {
  if (s.state === State.New) return 0;
  return scheduler(retention).get_retrievability(toCard(s), now, false);
}

/** Rebuilds a card from its attempt history (oldest first), honouring material-edit resets via content_hash. */
export function replay(userId: string, q: QuestionT, courseId: string, attempts: AttemptRow[], retention = 0.9): ReviewStateRow | null {
  const relevant = attempts.filter((a) => a.mode !== "mock" && a.content_hash === q.contentHash);
  if (!relevant.length && !attempts.some((a) => a.mode !== "mock")) return null;
  const sorted = [...relevant].sort((a, b) => a.answered_at.localeCompare(b.answered_at));
  const start = sorted[0] ? new Date(sorted[0].answered_at) : new Date();
  let s = newState(userId, q, courseId, start);
  for (const a of sorted) {
    s = applyAnswer(s, { correct: a.correct, confidence: a.confidence as Confidence, mode: a.mode as Mode, now: new Date(a.answered_at), retention }).state;
  }
  return s;
}
