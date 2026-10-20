// Derived numbers for the dashboard. Everything is computed from the local snapshot so it works offline.
import type { AttemptRow, DailyActivityRow, ReviewStateRow, SessionRow } from "./database.types";
import type { LoadedCourse } from "./content";
import { addDays, endOfLocalDay, localDate, startOfLocalDate, type DayClock } from "./time";
import { MINUTE, DAY } from "./utils";
import { State } from "./scheduler";

const GAP_CAP = 5 * MINUTE; // idle gaps longer than this don't count as study time
const TAIL = 20_000; // reading time after the last answer of a session

// ---------- daily activity ----------

/** Study minutes from attempt timestamps, grouped per session, with idle gaps capped. */
export function minutesByDate(attempts: AttemptRow[], sessions: Record<string, SessionRow>): Map<string, number> {
  const bySession = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const key = a.session_id ?? `solo:${a.id}`;
    const list = bySession.get(key);
    if (list) list.push(a);
    else bySession.set(key, [a]);
  }
  const out = new Map<string, number>();
  for (const [key, list] of bySession) {
    const s = sessions[key];
    let prev = s ? new Date(s.started_at).getTime() : new Date(list[0].answered_at).getTime() - list[0].time_ms;
    let ms = 0;
    for (const a of list) {
      const t = new Date(a.answered_at).getTime();
      ms += Math.min(Math.max(0, t - prev), GAP_CAP);
      prev = t;
    }
    ms += TAIL;
    const date = s?.local_date ?? list[0].local_date;
    out.set(date, (out.get(date) ?? 0) + ms / MINUTE);
  }
  return out;
}

export function dailyActivity(
  attempts: AttemptRow[],
  sessions: Record<string, SessionRow>,
  goalMinutes: number,
  userId: string,
): Map<string, DailyActivityRow> {
  const out = new Map<string, DailyActivityRow>();
  const row = (date: string) => {
    let r = out.get(date);
    if (!r) {
      r = { user_id: userId, local_date: date, answered: 0, correct: 0, sessions_completed: 0, minutes: 0, goal_met: false };
      out.set(date, r);
    }
    return r;
  };
  for (const a of attempts) {
    const r = row(a.local_date);
    r.answered++;
    if (a.correct) r.correct++;
  }
  for (const s of Object.values(sessions)) if (s.completed) row(s.local_date).sessions_completed++;
  for (const [date, min] of minutesByDate(attempts, sessions)) {
    const r = row(date);
    r.minutes = Math.round(min * 10) / 10;
    r.goal_met = r.minutes >= goalMinutes;
  }
  return out;
}

// ---------- streak ----------

export const qualifies = (r?: Pick<DailyActivityRow, "answered" | "sessions_completed">) => !!r && (r.sessions_completed >= 1 || r.answered >= 5);

export type Streak = { current: number; longest: number; todayDone: boolean; freezes: number; frozenDays: string[] };

/**
 * Same rules as public.streak_status(): walk forward from the first qualifying day; every 7th qualifying day
 * in a row earns a freeze (max 2); a missed day spends one if held, else the streak resets. Today only adds.
 */
export function streak(activity: Map<string, DailyActivityRow>, today: string): Streak {
  const days = [...activity.values()].filter(qualifies).map((r) => r.local_date).sort();
  if (!days.length) return { current: 0, longest: 0, todayDone: false, freezes: 0, frozenDays: [] };
  let run = 0, longest = 0, held = 0, earned = 0;
  const frozenDays: string[] = [];
  for (let d = days[0]; d < today; d = addDays(d, 1)) {
    if (qualifies(activity.get(d))) {
      run++;
      earned++;
      if (earned % 7 === 0 && held < 2) held++;
    } else if (run > 0 && held > 0) {
      held--;
      frozenDays.push(d);
    } else {
      run = 0;
      earned = 0;
    }
    longest = Math.max(longest, run);
  }
  const todayDone = qualifies(activity.get(today));
  if (todayDone) {
    run++;
    longest = Math.max(longest, run);
  }
  return { current: run, longest, todayDone, freezes: held, frozenDays };
}

// ---------- accuracy / readiness ----------

const STALE_DAYS = 14;
const STALE_CREDIT = 0.7; // a correct answer not re-tested for 14+ days counts for less
const GUESS = 0.25;

export function latestAttempts(attempts: AttemptRow[]): Map<string, AttemptRow> {
  const m = new Map<string, AttemptRow>();
  for (const a of attempts) {
    const prev = m.get(a.question_id);
    if (!prev || prev.answered_at <= a.answered_at) m.set(a.question_id, a);
  }
  return m;
}

export type DomainStat = { id: string; title: string; weight: number; bank: number; seen: number; coverage: number; mastery: number; accuracy: number };

export function domainStats(content: LoadedCourse, attempts: AttemptRow[], now = new Date()): DomainStat[] {
  const latest = latestAttempts(attempts);
  return content.course.domains.map((d) => {
    const sections = content.course.sections.filter((s) => s.domainId === d.id);
    const bankQs = content.questions.filter((q) => q.domainId === d.id);
    let seen = 0, rawCorrect = 0, weightedMastery = 0, seenShare = 0;
    for (const s of sections) {
      const qs = bankQs.filter((q) => content.sectionOf.get(q.id)?.id === s.id);
      const seenQs = qs.map((q) => latest.get(q.id)).filter((a): a is AttemptRow => !!a);
      if (!seenQs.length) continue;
      const share = qs.length / Math.max(1, bankQs.length);
      const credit = seenQs.reduce((acc, a) => {
        if (!a.correct) return acc;
        const stale = now.getTime() - new Date(a.answered_at).getTime() > STALE_DAYS * DAY;
        return acc + (stale ? STALE_CREDIT : 1);
      }, 0);
      weightedMastery += share * (credit / seenQs.length);
      seenShare += share;
      seen += seenQs.length;
      rawCorrect += seenQs.filter((a) => a.correct).length;
    }
    return {
      id: d.id,
      title: d.title,
      weight: d.weight,
      bank: bankQs.length,
      seen,
      coverage: bankQs.length ? seen / bankQs.length : 0,
      mastery: seenShare ? weightedMastery / seenShare : 0,
      accuracy: seen ? rawCorrect / seen : 0,
    };
  });
}

/** SPEC §5: Σ w_d × (coverage_d × mastery_d + (1 − coverage_d) × guess). 0..1 */
export function readiness(stats: DomainStat[]): number {
  return stats.reduce((acc, d) => acc + d.weight * (d.coverage * d.mastery + (1 - d.coverage) * GUESS), 0);
}

export type Calibration = { sure: { n: number; acc: number }; unsure: { n: number; acc: number }; confidentWrongRate: number };

export function calibration(attempts: AttemptRow[], lastN = 300): Calibration {
  const recent = attempts.slice(-lastN);
  const bucket = (c: string) => {
    const xs = recent.filter((a) => a.confidence === c);
    return { n: xs.length, acc: xs.length ? xs.filter((a) => a.correct).length / xs.length : 0 };
  };
  const sure = bucket("sure");
  const cw = recent.filter((a) => a.confidence === "sure" && !a.correct).length;
  return { sure, unsure: bucket("unsure"), confidentWrongRate: recent.length ? cw / recent.length : 0 };
}

// ---------- queue numbers ----------

export function dueCount(states: Record<string, ReviewStateRow>, now: Date, clock: DayClock, isActive: (qid: string) => boolean): number {
  const end = endOfLocalDay(now, clock).getTime();
  return Object.values(states).filter((s) => !s.suspended && s.state !== State.New && isActive(s.question_id) && new Date(s.due).getTime() < end).length;
}

/** Reviews falling due on each of the next `days` study days (day 0 = today, including overdue). */
export function forecast(states: Record<string, ReviewStateRow>, now: Date, clock: DayClock, days = 7): { date: string; due: number }[] {
  const today = localDate(now, clock);
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), due: 0 }));
  const bounds = out.map((o) => startOfLocalDate(addDays(o.date, 1), clock).getTime());
  for (const s of Object.values(states)) {
    if (s.suspended || s.state === State.New) continue;
    const t = new Date(s.due).getTime();
    const i = bounds.findIndex((b) => t < b);
    if (i >= 0) out[i].due++;
  }
  return out;
}

export function newIntroducedOn(attempts: AttemptRow[], date: string): number {
  const first = new Map<string, string>();
  for (const a of attempts) if (a.mode !== "mock" && !first.has(a.question_id)) first.set(a.question_id, a.local_date);
  let n = 0;
  for (const d of first.values()) if (d === date) n++;
  return n;
}
