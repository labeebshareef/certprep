// Local-first state. The UI reads only this snapshot; every write lands here first (IndexedDB) and is queued in
// an outbox that sync.ts flushes to Supabase. Attempts are the source of truth; review states are a cache.
import { createStore, get, setMany, type UseStore } from "idb-keyval";
import type { AttemptRow, ProfileRow, ReviewStateRow, SectionProgressRow, SessionRow } from "./database.types";
import type { LoadedCourse, QuestionT } from "./content";
import { applyAnswer, newState, reconcile, type Confidence, type Mode } from "./scheduler";
import { localDate } from "./time";
import { uuid } from "./utils";

export type Snapshot = {
  userId: string;
  profile: ProfileRow;
  states: Record<string, ReviewStateRow>;
  attempts: AttemptRow[]; // ascending by answered_at
  sessions: Record<string, SessionRow>;
  progress: Record<string, SectionProgressRow>;
  /** outbox key → version; keys look like "attempt:<id>", "state:<qid>", "session:<id>", "progress:<sid>", "daily:<date>", "profile" */
  outbox: Record<string, number>;
  pulledAttemptsAt: string | null;
  lastSyncAt: string | null;
};

type Collection = "profile" | "states" | "attempts" | "sessions" | "progress" | "meta";

export function defaultProfile(userId: string, now = new Date()): ProfileRow {
  return {
    user_id: userId,
    timezone: "Asia/Dubai",
    day_rollover_hour: 4,
    locale: "en",
    new_per_day: 10,
    daily_goal_min: 20,
    desired_retention: 0.9,
    active_course: "dva-c03",
    english_content: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

export function clockOf(p: ProfileRow) {
  return { timezone: p.timezone, rolloverHour: p.day_rollover_hour };
}

let idb: UseStore | undefined;
function db() {
  return (idb ??= createStore("certprep", "kv"));
}

export class LocalStore {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private version = 0;
  private pending = new Set<Collection>();
  private writing: Promise<void> = Promise.resolve();

  private constructor(snap: Snapshot) {
    this.snap = snap;
    this.version = Math.max(0, ...Object.values(snap.outbox)); // never reuse a version that may be in flight
  }

  static async open(userId: string): Promise<LocalStore> {
    const k = (c: Collection) => `${userId}:${c}`;
    const [profile, states, attempts, sessions, progress, meta] = await Promise.all(
      (["profile", "states", "attempts", "sessions", "progress", "meta"] as Collection[]).map((c) => get(k(c), db())),
    );
    return new LocalStore({
      userId,
      profile: profile ?? defaultProfile(userId),
      states: states ?? {},
      attempts: attempts ?? [],
      sessions: sessions ?? {},
      progress: progress ?? {},
      outbox: meta?.outbox ?? {},
      pulledAttemptsAt: meta?.pulledAttemptsAt ?? null,
      lastSyncAt: meta?.lastSyncAt ?? null,
    });
  }

  /** True when nothing has ever been stored or pulled for this user on this device. */
  get isEmpty() {
    return !this.snap.lastSyncAt && !this.snap.attempts.length && !Object.keys(this.snap.outbox).length;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  /** Resolves once everything written so far is persisted. */
  flushed() {
    return this.writing;
  }

  update(changes: Partial<Snapshot>, collections: Collection[], outboxKeys: string[] = []) {
    const outbox = { ...(changes.outbox ?? this.snap.outbox) };
    for (const key of outboxKeys) outbox[key] = ++this.version;
    this.snap = { ...this.snap, ...changes, outbox };
    if (outboxKeys.length) collections = [...collections, "meta"];
    for (const c of collections) this.pending.add(c);
    this.persist();
    for (const fn of this.listeners) fn();
  }

  /** Drops outbox keys that were synced, unless they were re-dirtied after the snapshot was taken. */
  ack(sent: Record<string, number>) {
    const outbox = { ...this.snap.outbox };
    for (const [key, v] of Object.entries(sent)) if (outbox[key] === v) delete outbox[key];
    this.update({ outbox }, ["meta"]);
  }

  private persist() {
    this.writing = this.writing.then(async () => {
      if (!this.pending.size) return;
      const s = this.snap;
      const cols = [...this.pending];
      this.pending.clear();
      const value: Record<Collection, unknown> = {
        profile: s.profile,
        states: s.states,
        attempts: s.attempts,
        sessions: s.sessions,
        progress: s.progress,
        meta: { outbox: s.outbox, pulledAttemptsAt: s.pulledAttemptsAt, lastSyncAt: s.lastSyncAt },
      };
      await setMany(cols.map((c) => [`${s.userId}:${c}`, value[c]]), db());
    }).catch((e) => console.error("IndexedDB write failed", e));
  }

  // ---------- domain writes ----------

  /** Re-checks every stored card against the current content (material edits reset the card). */
  reconcileWith(content: LoadedCourse, now = new Date()) {
    const states = { ...this.snap.states };
    const keys: string[] = [];
    for (const [qid, s] of Object.entries(states)) {
      const q = content.byId.get(qid);
      if (!q) continue;
      const next = reconcile(s, q, now);
      if (next) {
        states[qid] = next;
        keys.push(`state:${qid}`);
      }
    }
    if (keys.length) this.update({ states }, ["states"], keys);
    return keys.length;
  }

  recordAnswer(args: {
    q: QuestionT;
    content: LoadedCourse;
    selected: string[];
    correct: boolean;
    confidence: Confidence;
    mode: Mode;
    sessionId: string | null;
    timeMs: number;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    const { profile, userId } = this.snap;
    const section = args.content.sectionOf.get(args.q.id)!;
    const courseId = args.content.course.id;
    let prev = this.snap.states[args.q.id] ?? newState(userId, args.q, courseId, now);
    prev = reconcile(prev, args.q, now) ?? prev;
    const { state, rating } = applyAnswer(prev, {
      correct: args.correct,
      confidence: args.confidence,
      mode: args.mode,
      now,
      retention: profile.desired_retention,
    });
    const date = localDate(now, clockOf(profile));
    const attempt: AttemptRow = {
      id: uuid(),
      user_id: userId,
      course_id: courseId,
      question_id: args.q.id,
      content_hash: args.q.contentHash ?? "",
      session_id: args.sessionId,
      mode: args.mode,
      selected: [...args.selected].sort(),
      correct: args.correct,
      confidence: args.confidence,
      rating,
      time_ms: Math.max(0, Math.round(args.timeMs)),
      answered_at: now.toISOString(),
      local_date: date,
      domain_id: args.q.domainId,
      task_id: args.q.taskId ?? null,
      section_id: section.id,
      created_at: now.toISOString(),
    };
    const scheduled = args.mode !== "mock";
    this.update(
      {
        attempts: [...this.snap.attempts, attempt],
        ...(scheduled ? { states: { ...this.snap.states, [args.q.id]: state } } : {}),
      },
      scheduled ? ["attempts", "states"] : ["attempts"],
      [`attempt:${attempt.id}`, `daily:${date}`, ...(scheduled ? [`state:${args.q.id}`] : [])],
    );
    return { attempt, state, prev, rating };
  }

  putState(state: ReviewStateRow) {
    this.update({ states: { ...this.snap.states, [state.question_id]: state } }, ["states"], [`state:${state.question_id}`]);
  }

  startSession(kind: Mode, courseId: string, plan: { due: number; new: number }, sectionId: string | null = null, now = new Date()): SessionRow {
    const s: SessionRow = {
      id: uuid(),
      user_id: this.snap.userId,
      course_id: courseId,
      local_date: localDate(now, clockOf(this.snap.profile)),
      kind,
      section_id: sectionId,
      started_at: now.toISOString(),
      ended_at: null,
      completed: false,
      planned_due: plan.due,
      planned_new: plan.new,
      answered: 0,
      correct: 0,
    };
    this.putSession(s);
    return s;
  }

  putSession(s: SessionRow) {
    this.update({ sessions: { ...this.snap.sessions, [s.id]: s } }, ["sessions"], [`session:${s.id}`, `daily:${s.local_date}`]);
  }

  recordQuiz(courseId: string, sectionId: string, pct: number, passPct: number, now = new Date()) {
    const prev = this.snap.progress[sectionId];
    const passed = pct >= passPct;
    const row: SectionProgressRow = {
      user_id: this.snap.userId,
      course_id: courseId,
      section_id: sectionId,
      best_pct: Math.max(prev?.best_pct ?? 0, pct),
      attempts: (prev?.attempts ?? 0) + 1,
      passed_at: prev?.passed_at ?? (passed ? now.toISOString() : null),
      updated_at: now.toISOString(),
    };
    this.update({ progress: { ...this.snap.progress, [sectionId]: row } }, ["progress"], [`progress:${sectionId}`]);
    return row;
  }

  updateProfile(patch: Partial<ProfileRow>) {
    const profile = { ...this.snap.profile, ...patch, updated_at: new Date().toISOString() };
    this.update({ profile }, ["profile"], ["profile"]);
  }
}
