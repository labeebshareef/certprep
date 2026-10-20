import { describe, expect, it } from "vitest";
import { LocalStore } from "./store";
import { mergeSnapshot, push } from "./sync";
import { course } from "../test/fixtures";

let n = 0;
const uid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;

/** Minimal stand-in for the supabase-js query builder: records upserts, returns { error: null }. */
function fakeClient() {
  const calls: { table: string; rows: unknown[]; opts: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown, opts: unknown) => {
        calls.push({ table, rows: Array.isArray(rows) ? rows : [rows], opts });
        return { error: null };
      },
    }),
  };
  return { client: client as never, calls };
}

describe("LocalStore", () => {
  it("records an answer, persists it, and survives a reopen", async () => {
    const c = await course();
    const id = uid();
    const store = await LocalStore.open(id);
    const q = c.questions[0];
    const right = q.choices.filter((x) => x.correct).map((x) => x.id);
    const { attempt, state } = store.recordAnswer({ q, content: c, selected: right, correct: true, confidence: "sure", mode: "daily", sessionId: null, timeMs: 12_000 });
    expect(attempt.rating).toBe(3);
    expect(state.reps).toBe(1);
    expect(Object.keys(store.getSnapshot().outbox).sort()).toEqual([`attempt:${attempt.id}`, `daily:${attempt.local_date}`, `state:${q.id}`].sort());
    await store.flushed();
    const again = await LocalStore.open(id);
    expect(again.getSnapshot().attempts).toHaveLength(1);
    expect(again.getSnapshot().states[q.id].reps).toBe(1);
  });

  it("does not schedule mock answers", async () => {
    const c = await course();
    const store = await LocalStore.open(uid());
    store.recordAnswer({ q: c.questions[0], content: c, selected: ["a"], correct: false, confidence: "sure", mode: "mock", sessionId: null, timeMs: 1 });
    expect(store.getSnapshot().states).toEqual({});
    expect(store.getSnapshot().attempts).toHaveLength(1);
  });

  it("pushes attempts insert-only without created_at, then clears the outbox", async () => {
    const c = await course();
    const store = await LocalStore.open(uid());
    const s = store.startSession("daily", "dva-c03", { due: 0, new: 1 });
    store.recordAnswer({ q: c.questions[0], content: c, selected: ["a"], correct: false, confidence: "unsure", mode: "daily", sessionId: s.id, timeMs: 1 });
    store.recordQuiz("dva-c03", "lambda", 0.9, 0.8);
    const { client, calls } = fakeClient();
    await push(client, store);
    const att = calls.find((x) => x.table === "attempts")!;
    expect(att.opts).toEqual({ onConflict: "id", ignoreDuplicates: true });
    expect(att.rows[0]).not.toHaveProperty("created_at");
    expect(calls.map((x) => x.table).sort()).toEqual(["attempts", "daily_activity", "review_states", "section_progress", "sessions"]);
    expect(store.getSnapshot().outbox).toEqual({});
  });

  it("keeps keys that were re-dirtied during a push", async () => {
    const store = await LocalStore.open(uid());
    store.updateProfile({ new_per_day: 12 });
    const sent = { ...store.getSnapshot().outbox };
    store.updateProfile({ new_per_day: 15 });
    store.ack(sent);
    expect(Object.keys(store.getSnapshot().outbox)).toEqual(["profile"]);
  });

  it("records the first pass of a section and keeps the best score", async () => {
    const store = await LocalStore.open(uid());
    expect(store.recordQuiz("dva-c03", "lambda", 0.6, 0.8).passed_at).toBeNull();
    const p = store.recordQuiz("dva-c03", "lambda", 0.8, 0.8);
    expect(p.passed_at).not.toBeNull();
    expect(store.recordQuiz("dva-c03", "lambda", 0.5, 0.8)).toMatchObject({ best_pct: 0.8, attempts: 3, passed_at: p.passed_at });
  });
});

describe("mergeSnapshot", () => {
  it("takes newer server rows unless a local edit is pending, and unions attempts", async () => {
    const c = await course();
    const store = await LocalStore.open(uid());
    const q = c.questions[0];
    store.recordAnswer({ q, content: c, selected: ["a"], correct: true, confidence: "sure", mode: "daily", sessionId: null, timeMs: 1 });
    const snap = store.getSnapshot();
    const local = snap.states[q.id];
    const remoteState = { ...local, reps: 9, updated_at: "2999-01-01T00:00:00Z" };
    const remoteAttempt = { ...snap.attempts[0], id: "remote-1", answered_at: "2000-01-01T00:00:00Z", created_at: "2026-10-20T10:00:00Z" };
    // pending local edit wins
    let m = mergeSnapshot(snap, { profile: null, states: [remoteState], attempts: [remoteAttempt], sessions: [], progress: [] });
    expect(m.states![q.id].reps).toBe(local.reps);
    expect(m.attempts!.map((a) => a.id)[0]).toBe("remote-1"); // sorted by answered_at
    expect(m.pulledAttemptsAt).toBe("2026-10-20T10:00:00Z");
    // once synced, the newer server row wins
    m = mergeSnapshot({ ...snap, outbox: {} }, { profile: null, states: [remoteState], attempts: [], sessions: [], progress: [] });
    expect(m.states![q.id].reps).toBe(9);
  });

  it("adopts the server profile on a device that has never synced", async () => {
    const store = await LocalStore.open(uid());
    const snap = store.getSnapshot();
    const remote = { ...snap.profile, new_per_day: 15, updated_at: "2000-01-01T00:00:00Z" };
    expect(mergeSnapshot(snap, { profile: remote, states: [], attempts: [], sessions: [], progress: [] }).profile!.new_per_day).toBe(15);
    expect(mergeSnapshot({ ...snap, lastSyncAt: "x" }, { profile: remote, states: [], attempts: [], sessions: [], progress: [] }).profile!.new_per_day).toBe(10);
  });
});
