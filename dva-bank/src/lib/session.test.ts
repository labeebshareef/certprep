import { describe, expect, it } from "vitest";
import { advance, interleave, planDaily, planMock, planQuiz, roundRobin, startQueue, unlockedSections, HARD_STOP_MS, SOFT_STOP_MS, RELEARN_GAP } from "./session";
import { applyAnswer, newState } from "./scheduler";
import type { ReviewStateRow, SectionProgressRow } from "./database.types";
import { course, CLOCK, UID } from "../test/fixtures";
import { MINUTE } from "./utils";

const passed = (sid: string): SectionProgressRow => ({ user_id: UID, course_id: "dva-c03", section_id: sid, best_pct: 0.9, attempts: 1, passed_at: "2026-10-01T00:00:00Z", updated_at: "" });

describe("gating", () => {
  it("unlocks the first section only, then the next after a pass", async () => {
    const c = await course();
    expect(unlockedSections(c, {}).map((s) => s.id)).toEqual(["lambda"]);
    expect(unlockedSections(c, { lambda: passed("lambda") }).map((s) => s.id)).toEqual(["lambda", "dynamodb"]);
    expect(unlockedSections(c, { lambda: { ...passed("lambda"), passed_at: null } }).map((s) => s.id)).toEqual(["lambda"]);
  });
});

describe("ordering", () => {
  it("interleaves groups without reordering much", () => {
    const xs = ["a1", "a2", "b1", "a3", "b2"];
    expect(interleave(xs, (x) => x[0])).toEqual(["a1", "b1", "a2", "b2", "a3"]);
    expect(roundRobin([["a1", "a2"], ["b1"], ["c1", "c2"]])).toEqual(["a1", "b1", "c1", "a2", "c2"]);
  });
});

describe("daily plan", () => {
  const now = new Date("2026-10-20T08:00:00Z");

  it("starts with up to 10 new questions from unlocked sections", async () => {
    const c = await course();
    const plan = planDaily({ content: c, states: {}, progress: {}, attempts: [], newPerDay: 10, retention: 0.9, clock: CLOCK, now });
    expect(plan.due).toBe(0);
    expect(plan.fresh).toBe(10);
    expect(plan.items.every((i) => c.sectionOf.get(i.qid)!.id === "lambda")).toBe(true);
  });

  it("puts due reviews first, lowest retrievability first, and skips suspended cards", async () => {
    const c = await course();
    const states: Record<string, ReviewStateRow> = {};
    const qs = c.questions.filter((q) => c.sectionOf.get(q.id)!.id === "lambda").slice(0, 3);
    for (const [i, q] of qs.entries()) {
      const t = new Date(now.getTime() - (i + 2) * 24 * 60 * MINUTE);
      let s = applyAnswer(newState(UID, q, "dva-c03", t), { correct: true, confidence: "sure", mode: "daily", now: t }).state;
      s = { ...s, due: new Date(now.getTime() - MINUTE).toISOString() };
      states[q.id] = s;
    }
    states[qs[2].id] = { ...states[qs[2].id], suspended: true };
    const plan = planDaily({ content: c, states, progress: {}, attempts: [], newPerDay: 10, retention: 0.9, clock: CLOCK, now });
    expect(plan.due).toBe(2);
    expect(plan.items.slice(0, 2).map((i) => i.kind)).toEqual(["due", "due"]);
    // qs[1] was reviewed longer ago → lower retrievability → first
    expect(plan.items[0].qid).toBe(qs[1].id);
    expect(plan.items.some((i) => i.qid === qs[2].id)).toBe(false);
  });

  it("interleaves new questions across unlocked sections", async () => {
    const c = await course();
    const plan = planDaily({ content: c, states: {}, progress: { lambda: passed("lambda"), dynamodb: passed("dynamodb") }, attempts: [], newPerDay: 6, retention: 0.9, clock: CLOCK, now });
    const secs = plan.items.map((i) => c.sectionOf.get(i.qid)!.id);
    expect(new Set(secs)).toEqual(new Set(["lambda", "dynamodb", "messaging"]));
    expect(secs.slice(0, 3)).toEqual(["lambda", "dynamodb", "messaging"]);
  });
});

describe("queue", () => {
  it("re-inserts a missed question once, at least RELEARN_GAP items later", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ qid: `q${i}`, kind: "due" as const }));
    let r = advance(startQueue(items), { wrong: true, relearn: true, elapsedMs: 0 });
    expect(r.queue.items[1 + RELEARN_GAP]).toEqual({ qid: "q0", kind: "relearn" });
    // missing the relearn again does not add a third copy
    const q = { ...r.queue, index: 1 + RELEARN_GAP };
    r = advance(q, { wrong: true, relearn: true, elapsedMs: 0 });
    expect(r.queue.items.filter((i) => i.qid === "q0")).toHaveLength(2);
  });

  it("drops unseen new items after the soft stop and ends at the hard stop", () => {
    const items = [{ qid: "a", kind: "due" as const }, { qid: "b", kind: "new" as const }, { qid: "c", kind: "due" as const }];
    const soft = advance(startQueue(items), { wrong: false, relearn: true, elapsedMs: SOFT_STOP_MS });
    expect(soft.queue.items.map((i) => i.qid)).toEqual(["a", "c"]);
    expect(soft.done).toBe(false);
    const hard = advance(startQueue(items), { wrong: false, relearn: true, elapsedMs: HARD_STOP_MS });
    expect(hard).toMatchObject({ done: true, reason: "time" });
  });
});

describe("quiz and mock", () => {
  it("draws a section quiz of quizSize from that section", async () => {
    const c = await course();
    const ids = planQuiz(c, c.course.sections[0]);
    expect(ids.length).toBe(Math.min(10, c.questions.filter((q) => c.sectionOf.get(q.id)!.id === "lambda").length));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("allocates mock questions by domain weight", async () => {
    const c = await course();
    const ids = planMock(c, 65);
    expect(ids).toHaveLength(65);
    const per = (d: string) => ids.filter((id) => c.byId.get(id)!.domainId === d).length;
    // d1 30% → 19 or 20; capped by bank size per domain (d4 has 11 in the seed bank)
    expect(per("d1")).toBeGreaterThanOrEqual(19);
    expect(per("d4")).toBeLessThanOrEqual(11);
    expect(new Set(ids).size).toBe(65);
  });
});
