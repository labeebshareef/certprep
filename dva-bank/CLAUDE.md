# AWS DVA exam-prep app — project guide for Claude Code

Owner: Labeeb (senior fullstack JS engineer, frontend specialisation). Goal: pass AWS Certified Developer – Associate with a very high score. **Studying beats building** — every hour on the app is an hour not studying, so the app stays minimal and shippable in small increments.

## What exists now
- `content/dva-c03/` — the question bank as JSON (85 seed questions on the C02→C03 overlap core). Validated by `schema/content.ts` (Zod). See `README.md` for layout and `AUTHORING.md` for the question format.
- `scripts/` — validate / hash / normalize / glossary / manifest. `npm run build` runs them all.
- `preview.html` — throwaway quiz runner (localStorage only). Replace with the PWA; don't extend it.
- `docs/SPEC.md` — the full technical spec and research (exam facts, FSRS, schema, Supabase tables, stack, MVP plan). **Read it before building.**
- `supabase/migrations/0001_init.sql` — per-user state schema. Reviewed and smoke-tested on local Postgres 16 with auth stubs (idempotent re-run, RLS isolation, append-only `attempts`, streak + freeze). **Not yet applied** to the hosted project.
- Supabase project: ref `uzmadqbamyryefhayyzy`, region ap-southeast-2 (Sydney), URL `https://uzmadqbamyryefhayyzy.supabase.co`. Keys/DB password go in `.env` (gitignored), never in the repo. Note: the `supabase_local_artist_production` MCP server in Claude sessions is a *different* project — never run migrations through it.
- `.claude/skills/magic-ui/SKILL.md` — UI component skill. Use the free Magic UI components only.

## Decisions (do not re-litigate without asking)
1. **Content is JSON in the repo**, not in the database. Supabase stores only per-user state keyed by the string question id (`dva-c03/lambda/0042`). A new course = a new folder under `content/`. Moving content into Postgres is a later one-time loader script for the SaaS idea.
2. **Scheduler: `ts-fsrs` pinned to 5.4.2** (FSRS-6), `request_retention: 0.9`, run on the client. Outcome → rating: wrong = Again; right+unsure = Hard; right+sure = Good. No Easy in v1. Leech at 4 lapses. Confident-wrong items get re-tested within ≤3 days regardless of interval.
3. **Session builder:** due reviews first (lowest retrievability first, interleaved across topics), then up to 10 new questions from unlocked sections, soft stop 25 min, hard stop 30 min. Shuffle choice order on every presentation.
4. **Gating:** a section unlocks when the previous section's quiz scores ≥ 80%; immediate retakes allowed. Daily review draws from all unlocked sections.
5. **Streak:** extends on ≥1 completed session (`daily_activity.sessions_completed`) or ≥5 answers; separate 20-minute daily goal ring (`goal_met`, does not affect the streak); 1 freeze earned per 7-day streak, max 2. Day rollover at 04:00 local (Asia/Dubai, UTC+4, no DST).
6. **i18n:** English canonical; Malayalam overlay in `content/<course>/i18n/ml/`, keyed by question id with `sourceHash` = English `contentHash`. `{{t:...}}` / `{{code:...}}` tokens are protected terms and are never translated. Stale translation → fall back to English for that question. UI strings via react-i18next; question content via a custom token-aware renderer (never through `t()`/`<Trans>`).
7. **Stack:** Vite + React 19 + TypeScript 5.9.3 (pinned; npm `latest` is now 7.x native — don't upgrade mid-build), react-router, TanStack Query, @supabase/supabase-js 2.x, Zod 4, Tailwind 4 + shadcn-style components + Magic UI (free), vite-plugin-pwa (`registerType: 'prompt'`), idb-keyval outbox for offline answers, Recharts. Fonts self-hosted via Fontsource: Inter + Noto Sans Malayalam (`:lang(ml) { line-height: 1.75 }`).
8. **Exam version:** DVA-C02 last test date 2026-11-30; DVA-C03 GA 2026-12-01 (guide published 2026-10-27). Course folder is `dva-c03`; `course.json` is `provisional` until the guide drops — then update task statements, retag `taskId`s, add new-scope sections (Bedrock, AgentCore, Amazon Q, Kiro, Data Firehose, PrivateLink, AI security).

## Build order (timeboxed — see docs/SPEC.md §(d))
Day 1: scaffold → auth + `profiles` → migration → content loader with Zod → study loop (question card, sure/unsure before submit, reveal with per-choice explanations, FSRS rating, persist) → section quiz + 80% gate → deploy.
Day 2: study first. Then home screen (due count, streak, goal ring, domain accuracy bars), then vite-plugin-pwa.
Later, only when friction is real: offline outbox · leech list · readiness score + calibration · confident-wrong queue · 65-question timed mock · Malayalam overlay + renderer + fonts.
Defer: full ml translation, FSRS parameter optimisation, push reminders/pg_cron, leagues/XP, multi-course UI, content in DB, PowerSync/Electric, admin tooling.

## Conventions
- Never edit a question's `id`. Material content edits → `changeKind: "material"` (app resets that card). Run `npm run build` after any content change; CI should fail on validator errors.
- Readiness score is computed client-side from `course.json` domain weights × per-topic accuracy (formula in SPEC §5). Don't put weights in the database.
- All user-scoped tables: `user_id uuid not null default auth.uid()`, RLS on, policy `using ((select auth.uid()) = user_id)`, index on `user_id`. Views `with (security_invoker = true)`.
- Attempts are append-only with client-generated UUIDs (idempotent sync). RLS allows only select + insert on `attempts`, so sync must use `upsert(..., { ignoreDuplicates: true })` (ON CONFLICT DO NOTHING), never a plain upsert/update. `review_states` is a derived cache rebuildable from attempts via `scheduler.reschedule()`.
- Commands: `npm run validate` · `npm run hash` · `npm run build` (idempotent — a clean tree should stay clean) · `npx serve .` then open `/preview.html`.
- Question generation: give Claude `AUTHORING.md` + `course.json`, one topic file per task, ~10 items each, then run an independent answer-key review pass before merging (LLM banks contain wrong keys; the seed bank went through that pass).
