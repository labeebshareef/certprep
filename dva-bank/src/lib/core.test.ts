import { describe, expect, it } from "vitest";
import { addDays, endOfLocalDay, localDate, startOfLocalDate } from "./time";
import { applyAnswer, newState, ratingFor, Rating, reconcile, replay, RECHECK_DAYS, State, LEECH_LAPSES } from "./scheduler";
import { segments, plain } from "./tokens";
import { isCorrect, localize } from "./content";
import { DAY, MINUTE } from "./utils";
import { course, CLOCK, UID } from "../test/fixtures";

describe("time", () => {
  it("rolls the study day over at 04:00 Asia/Dubai", () => {
    // 2026-10-20T23:30Z = 03:30 on the 21st in Dubai → still the 20th
    expect(localDate(new Date("2026-10-20T23:30:00Z"), CLOCK)).toBe("2026-10-20");
    // 00:30Z = 04:30 local on the 21st → the 21st
    expect(localDate(new Date("2026-10-21T00:30:00Z"), CLOCK)).toBe("2026-10-21");
  });
  it("computes day boundaries", () => {
    expect(startOfLocalDate("2026-10-21", CLOCK).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(endOfLocalDay(new Date("2026-10-20T12:00:00Z"), CLOCK).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("tokens", () => {
  it("splits protected terms", () => {
    expect(segments("Use {{t:AWS Lambda}} with {{code:--query}}.")).toEqual([
      { kind: "text", value: "Use " },
      { kind: "term", value: "AWS Lambda" },
      { kind: "text", value: " with " },
      { kind: "code", value: "--query" },
      { kind: "text", value: "." },
    ]);
    expect(plain("{{t:Amazon SQS}} queue")).toBe("Amazon SQS queue");
  });
});

describe("content", () => {
  it("loads and validates the bank", async () => {
    const c = await course();
    expect(c.questions.length).toBeGreaterThanOrEqual(85);
    expect(c.course.sections[0].id).toBe("lambda");
    const multi = c.questions.find((q) => q.type === "multi")!;
    const right = multi.choices.filter((x) => x.correct).map((x) => x.id);
    expect(isCorrect(multi, right)).toBe(true);
    expect(isCorrect(multi, right.slice(0, 1))).toBe(false);
  });
  it("falls back to English when the overlay is stale or missing", async () => {
    const c = await course();
    const q = c.questions[0];
    const stale = { ml: { [q.id]: { sourceHash: "sha256:" + "0".repeat(64), stem: "x", explanation: "y", choices: {}, meta: { translator: "t", reviewed: false } } } };
    const l = localize(q, "ml", stale as never);
    expect(l.lang).toBe("en");
    expect(l.fallback).toBe(true);
    const fresh = { ml: { [q.id]: { ...stale.ml[q.id], sourceHash: q.contentHash!, choices: Object.fromEntries(q.choices.map((ch) => [ch.id, { text: "ml", explanation: "ml" }])) } } };
    expect(localize(q, "ml", fresh as never).lang).toBe("ml");
    expect(localize(q, "ml", fresh as never, true).lang).toBe("en");
  });
});

describe("scheduler", () => {
  it("maps outcomes to ratings", () => {
    expect(ratingFor(false, "sure")).toBe(Rating.Again);
    expect(ratingFor(false, "unsure")).toBe(Rating.Again);
    expect(ratingFor(true, "unsure")).toBe(Rating.Hard);
    expect(ratingFor(true, "sure")).toBe(Rating.Good);
  });

  it("does not schedule mock answers", async () => {
    const c = await course();
    const s = newState(UID, c.questions[0], "dva-c03", new Date());
    const r = applyAnswer(s, { correct: true, confidence: "sure", mode: "mock", now: new Date() });
    expect(r.state).toBe(s);
  });

  it("caps the next interval after a confident-wrong answer, then clears it after a delayed re-test", async () => {
    const c = await course();
    const t0 = new Date("2026-10-20T08:00:00Z");
    let s = newState(UID, c.questions[0], "dva-c03", t0);
    // build a mature card so its next interval would be long
    let t = t0;
    for (let i = 0; i < 6; i++) {
      s = applyAnswer(s, { correct: true, confidence: "sure", mode: "daily", now: t }).state;
      t = new Date(s.due);
    }
    s = applyAnswer(s, { correct: false, confidence: "sure", mode: "daily", now: t }).state;
    expect(s.recheck_by).not.toBeNull();
    const recheck = new Date(s.recheck_by!).getTime();
    expect(recheck - t.getTime()).toBe(RECHECK_DAYS * DAY);
    // same-day relearn: correct, but due must stay inside the re-check window
    const t1 = new Date(t.getTime() + 15 * MINUTE);
    s = applyAnswer(s, { correct: true, confidence: "sure", mode: "daily", now: t1 }).state;
    expect(new Date(s.due).getTime()).toBeLessThanOrEqual(recheck);
    expect(s.recheck_by).not.toBeNull();
    // re-tested a day later: cleared
    const t2 = new Date(t.getTime() + 2 * DAY);
    s = applyAnswer(s, { correct: true, confidence: "sure", mode: "daily", now: t2 }).state;
    expect(s.recheck_by).toBeNull();
  });

  it("marks leeches and suspends them", async () => {
    const c = await course();
    let t = new Date("2026-10-20T08:00:00Z");
    let s = newState(UID, c.questions[0], "dva-c03", t);
    s = applyAnswer(s, { correct: true, confidence: "sure", mode: "daily", now: t }).state;
    for (let i = 0; i < 20 && s.lapses < LEECH_LAPSES; i++) {
      t = new Date(new Date(s.due).getTime() + MINUTE);
      const wrong = s.state === State.Review;
      s = applyAnswer(s, { correct: !wrong, confidence: "sure", mode: "daily", now: t }).state;
    }
    expect(s.lapses).toBeGreaterThanOrEqual(LEECH_LAPSES);
    expect(s.is_leech).toBe(true);
    expect(s.suspended).toBe(true);
  });

  it("resets material edits and keeps cosmetic ones", async () => {
    const c = await course();
    const q = c.questions[0];
    const now = new Date();
    const s = { ...applyAnswer(newState(UID, q, "dva-c03", now), { correct: true, confidence: "sure", mode: "daily", now }).state, content_hash: "sha256:old" };
    expect(reconcile(s, { ...q, changeKind: "material" }, now)!.reps).toBe(0);
    const cos = reconcile(s, { ...q, changeKind: "cosmetic" }, now)!;
    expect(cos.reps).toBe(s.reps);
    expect(cos.content_hash).toBe(q.contentHash);
    expect(reconcile({ ...s, content_hash: q.contentHash! }, q, now)).toBeNull();
  });

  it("rebuilds a card from attempts", async () => {
    const c = await course();
    const q = c.questions[0];
    const mk = (min: number, correct: boolean) => ({
      id: String(min), user_id: UID, course_id: "dva-c03", question_id: q.id, content_hash: q.contentHash!, session_id: null,
      mode: "daily", selected: [], correct, confidence: "sure", rating: 3, time_ms: 1000,
      answered_at: new Date(Date.UTC(2026, 9, 20) + min * MINUTE).toISOString(), local_date: "2026-10-20",
      domain_id: "d1", task_id: null, section_id: "lambda", created_at: "",
    });
    const s = replay(UID, q, "dva-c03", [mk(0, true), mk(20, false), mk(40, true)])!;
    expect(s.reps).toBe(3);
    // one learning step: the first Good graduates the card, so the later miss is a lapse
    expect(s.lapses).toBe(1);
    expect(s.state).toBe(State.Review);
  });
});
