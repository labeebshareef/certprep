import { describe, expect, it } from "vitest";
import { calibration, dailyActivity, domainStats, readiness, streak } from "./stats";
import type { AttemptRow, DailyActivityRow } from "./database.types";
import { addDays } from "./time";
import { course, UID } from "../test/fixtures";

const day = (d: string, answered: number, sessions = 0): [string, DailyActivityRow] => [
  d,
  { user_id: UID, local_date: d, answered, correct: 0, sessions_completed: sessions, minutes: 0, goal_met: false },
];

describe("streak (mirrors public.streak_status)", () => {
  const today = "2026-10-20";
  it("bridges a missed day with a freeze earned after 7 days", () => {
    const m = new Map([...Array.from({ length: 7 }, (_, i) => day(addDays(today, -9 + i), 5)), day(addDays(today, -1), 0, 1), day(today, 0, 1)]);
    expect(streak(m, today)).toMatchObject({ current: 9, longest: 9, todayDone: true, freezes: 0, frozenDays: [addDays(today, -2)] });
    m.delete(today);
    expect(streak(m, today)).toMatchObject({ current: 8, todayDone: false });
    m.delete(addDays(today, -1));
    expect(streak(m, today)).toMatchObject({ current: 0, longest: 7 });
  });
  it("needs a completed session or 5 answers", () => {
    expect(streak(new Map([day(today, 4)]), today).todayDone).toBe(false);
    expect(streak(new Map([day(today, 5)]), today).todayDone).toBe(true);
    expect(streak(new Map([day(today, 1, 1)]), today).current).toBe(1);
  });
  it("caps held freezes at 2", () => {
    const m = new Map(Array.from({ length: 30 }, (_, i) => day(addDays(today, -30 + i), 5)));
    expect(streak(m, today).freezes).toBe(2);
  });
});

const attempt = (qid: string, correct: boolean, confidence: "sure" | "unsure", at: string, extra: Partial<AttemptRow> = {}): AttemptRow => ({
  id: `${qid}-${at}`, user_id: UID, course_id: "dva-c03", question_id: qid, content_hash: "", session_id: null, mode: "daily",
  selected: [], correct, confidence, rating: 3, time_ms: 30_000, answered_at: at, local_date: at.slice(0, 10), domain_id: "d1",
  task_id: null, section_id: "lambda", created_at: at, ...extra,
});

describe("activity", () => {
  it("counts minutes with idle gaps capped", () => {
    const sessions = { s1: { id: "s1", user_id: UID, course_id: "dva-c03", local_date: "2026-10-20", kind: "daily", section_id: null, started_at: "2026-10-20T08:00:00Z", ended_at: null, completed: true, planned_due: 0, planned_new: 0, answered: 2, correct: 1 } };
    const a = [
      attempt("a", true, "sure", "2026-10-20T08:02:00Z", { session_id: "s1" }),
      attempt("b", false, "sure", "2026-10-20T09:00:00Z", { session_id: "s1" }), // 58 min gap → 5
    ];
    const r = dailyActivity(a, sessions, 20, UID).get("2026-10-20")!;
    expect(r.answered).toBe(2);
    expect(r.correct).toBe(1);
    expect(r.sessions_completed).toBe(1);
    expect(r.minutes).toBeCloseTo(2 + 5 + 1 / 3, 1);
    expect(r.goal_met).toBe(false);
  });
});

describe("readiness", () => {
  it("is the guess rate with no data and rises with mastery", async () => {
    const c = await course();
    expect(readiness(domainStats(c, []))).toBeCloseTo(0.25, 5);
    const now = new Date("2026-10-20T08:00:00Z");
    const all = c.questions.map((q) => attempt(q.id, true, "sure", now.toISOString(), { domain_id: q.domainId }));
    expect(readiness(domainStats(c, all, now))).toBeCloseTo(1, 5);
    const later = new Date(now.getTime() + 20 * 86400_000);
    expect(readiness(domainStats(c, all, later))).toBeCloseTo(0.7, 5); // all stale
  });
  it("tracks calibration", () => {
    const a = [attempt("a", true, "sure", "1"), attempt("b", false, "sure", "2"), attempt("c", true, "unsure", "3")];
    const cal = calibration(a);
    expect(cal.sure).toEqual({ n: 2, acc: 0.5 });
    expect(cal.unsure).toEqual({ n: 1, acc: 1 });
    expect(cal.confidentWrongRate).toBeCloseTo(1 / 3);
  });
});
