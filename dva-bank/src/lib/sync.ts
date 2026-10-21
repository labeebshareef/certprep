// Outbox flush + pull. Attempts are insert-only on the server (RLS), so they go up with ON CONFLICT DO NOTHING;
// everything else is an upsert of the current local row. Pull merges server rows that have no pending local edit.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptRow, Database, ReviewStateRow, SectionProgressRow, SessionRow } from "./database.types";
import type { LocalStore, Snapshot } from "./store";
import { dailyActivity } from "./stats";

type Client = SupabaseClient<Database>;
const PAGE = 1000;

export type SyncResult = { pushed: number; pulled: number };

function group(outbox: Snapshot["outbox"]) {
  const g: Record<string, string[]> = {};
  for (const key of Object.keys(outbox)) {
    const i = key.indexOf(":");
    const kind = i < 0 ? key : key.slice(0, i);
    (g[kind] ??= []).push(i < 0 ? "" : key.slice(i + 1));
  }
  return g;
}

function check<T>(r: { error: { message: string } | null; data?: T | null }) {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function push(client: Client, store: LocalStore): Promise<number> {
  const snap = store.getSnapshot();
  const sent = { ...snap.outbox };
  if (!Object.keys(sent).length) return 0;
  const g = group(sent);

  if (g.profile) {
    const { created_at: _c, ...profile } = snap.profile;
    check(await client.from("profiles").upsert(profile, { onConflict: "user_id" }));
  }
  if (g.session?.length) {
    const rows = g.session.map((id) => snap.sessions[id]).filter(Boolean);
    if (rows.length) check(await client.from("sessions").upsert(rows, { onConflict: "id" }));
  }
  if (g.attempt?.length) {
    const ids = new Set(g.attempt);
    // created_at is the server's receive time and doubles as the pull cursor, so never send it
    const rows = snap.attempts.filter((a) => ids.has(a.id)).map(({ created_at: _c, ...a }) => a);
    for (let i = 0; i < rows.length; i += PAGE)
      check(await client.from("attempts").upsert(rows.slice(i, i + PAGE), { onConflict: "id", ignoreDuplicates: true }));
  }
  if (g.state?.length) {
    const rows = g.state.map((qid) => snap.states[qid]).filter(Boolean);
    for (let i = 0; i < rows.length; i += PAGE)
      check(await client.from("review_states").upsert(rows.slice(i, i + PAGE), { onConflict: "user_id,question_id" }));
  }
  if (g.progress?.length) {
    const rows = g.progress.map((sid) => snap.progress[sid]).filter(Boolean);
    if (rows.length) check(await client.from("section_progress").upsert(rows, { onConflict: "user_id,course_id,section_id" }));
  }
  if (g.daily?.length) {
    const all = dailyActivity(snap.attempts, snap.sessions, snap.profile.daily_goal_min, snap.userId);
    const rows = g.daily.map((d) => all.get(d)).filter((r) => !!r);
    if (rows.length) check(await client.from("daily_activity").upsert(rows, { onConflict: "user_id,local_date" }));
  }

  store.ack(sent);
  return Object.keys(sent).length;
}

async function selectAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = check<T[]>(await fetchPage(from, from + PAGE - 1)) ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export function mergeSnapshot(
  snap: Snapshot,
  remote: { profile: Snapshot["profile"] | null; states: ReviewStateRow[]; attempts: AttemptRow[]; sessions: SessionRow[]; progress: SectionProgressRow[] },
): Partial<Snapshot> & { pulled: number } {
  const pending = snap.outbox;
  let pulled = 0;

  // A device that has never synced holds only a default profile, so the server's settings win there.
  const takeRemoteProfile = !!remote.profile && !("profile" in pending) && (!snap.lastSyncAt || remote.profile.updated_at > snap.profile.updated_at);
  const profile = takeRemoteProfile ? remote.profile! : snap.profile;

  const states = { ...snap.states };
  for (const r of remote.states) {
    const local = states[r.question_id];
    if (`state:${r.question_id}` in pending) continue;
    if (!local || r.updated_at > local.updated_at) {
      states[r.question_id] = r;
      pulled++;
    }
  }

  const known = new Set(snap.attempts.map((a) => a.id));
  const fresh = remote.attempts.filter((a) => !known.has(a.id));
  pulled += fresh.length;
  const attempts = fresh.length ? [...snap.attempts, ...fresh].sort((a, b) => a.answered_at.localeCompare(b.answered_at)) : snap.attempts;

  const sessions = { ...snap.sessions };
  for (const s of remote.sessions) if (!(`session:${s.id}` in pending) && !sessions[s.id]) sessions[s.id] = s;

  const progress = { ...snap.progress };
  for (const p of remote.progress) {
    const local = progress[p.section_id];
    if (!local) {
      progress[p.section_id] = p;
      continue;
    }
    progress[p.section_id] = {
      ...local,
      best_pct: Math.max(local.best_pct, p.best_pct),
      attempts: Math.max(local.attempts, p.attempts),
      passed_at: [local.passed_at, p.passed_at].filter(Boolean).sort()[0] ?? null,
    };
  }

  const cursor = remote.attempts.reduce<string | null>((m, a) => (!m || a.created_at > m ? a.created_at : m), snap.pulledAttemptsAt);
  return { profile, states, attempts, sessions, progress, pulledAttemptsAt: cursor, pulled };
}

export async function pull(client: Client, store: LocalStore): Promise<number> {
  const snap = store.getSnapshot();
  const uid = snap.userId;
  const [profileRes, states, attempts, sessions, progress] = await Promise.all([
    client.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
    selectAll<ReviewStateRow>((a, b) => client.from("review_states").select("*").eq("user_id", uid).order("question_id").range(a, b)),
    selectAll<AttemptRow>((a, b) => {
      let q = client.from("attempts").select("*").eq("user_id", uid);
      if (snap.pulledAttemptsAt) q = q.gt("created_at", snap.pulledAttemptsAt);
      return q.order("created_at").order("id").range(a, b);
    }),
    selectAll<SessionRow>((a, b) => client.from("sessions").select("*").eq("user_id", uid).order("started_at").range(a, b)),
    selectAll<SectionProgressRow>((a, b) => client.from("section_progress").select("*").eq("user_id", uid).range(a, b)),
  ]);
  const profile = check<Snapshot["profile"] | null>(profileRes);
  const { pulled, ...changes } = mergeSnapshot(store.getSnapshot(), { profile, states, attempts, sessions, progress });
  store.update({ ...changes, lastSyncAt: new Date().toISOString() }, ["profile", "states", "attempts", "sessions", "progress", "meta"]);
  // first login on a fresh account: make sure a profile row exists server-side
  if (!profile) store.updateProfile({});
  return pulled;
}

export async function sync(client: Client, store: LocalStore): Promise<SyncResult> {
  const pushed = await push(client, store);
  const pulled = await pull(client, store);
  if (Object.keys(store.getSnapshot().outbox).length) await push(client, store);
  return { pushed, pulled };
}
