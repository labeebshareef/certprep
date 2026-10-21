# AWS DVA exam-prep app — project guide for Claude Code

Owner: Labeeb (senior fullstack JS engineer, frontend specialisation). Goal: pass AWS Certified Developer – Associate with a very high score. **Studying beats building** — every hour on the app is an hour not studying, so the app stays minimal and shippable in small increments.

## What exists now
- **The app** (`src/`, Vite root is this folder) — local-first PWA. Layout:
  - `src/lib/` pure logic with unit tests: `scheduler.ts` (FSRS wrapper: ratings, confident-wrong `recheck_by`, leeches, material-edit resets, `replay()`), `session.ts` (daily plan, in-session queue with relearn + 25/30-min caps, gating, quiz, mock sampling), `stats.ts` (daily activity, streak with freezes, readiness, calibration, forecast), `store.ts` (IndexedDB snapshot + outbox), `sync.ts` (push/pull/merge), `content.ts` (Zod loader, overlay `localize()`), `time.ts` (study-day maths), `tokens.ts`.
  - `src/state/app.tsx` auth + per-user store + background sync; `src/routes/` screens; `src/components/` QuestionCard, SessionRunner, Layout, `ui/` (shadcn-style), `magicui/` (vendored free Magic UI sources).
  - `src/i18n/` UI strings: `en.ts` canonical, `ml.ts` machine-assisted and **unreviewed**.
- `content/dva-c03/` — the question bank as JSON (85 seed questions on the C02→C03 overlap core). Validated by `schema/content.ts` (Zod), both by the CLI and at app load. See `README.md` for layout and `AUTHORING.md` for the question format.
- `scripts/` — validate / hash / normalize / glossary / manifest. `npm run content` runs them all.
- `e2e/` — Playwright tests against a stubbed Supabase (no real users are created).
- `docs/SPEC.md` — the full technical spec and research. Read it before changing behaviour.
- `supabase/migrations/` — `0001_init.sql` + `0002_harden_and_sync_indexes.sql`, **applied** to the hosted project on 2026-10-20 (see `supabase/README.md` for how; security advisors clean). `src/lib/database.types.ts` was generated from it — regenerate after any migration.
- Supabase project: ref `uzmadqbamyryefhayyzy`, region ap-southeast-2 (Sydney), URL `https://uzmadqbamyryefhayyzy.supabase.co`. Keys go in `.env` (gitignored), never in the repo. In Claude sessions the `supabase_certprep` MCP server is connected to this project; any other Supabase MCP server is a different project — never run migrations through it. Use the `sb_publishable_...` key, not the legacy anon JWT. The MCP `apply_migration` stalls (waits for a hidden confirmation) on `drop ... if exists`; leave drops out of migrations sent through it.
- `.claude/skills/magic-ui/SKILL.md` — UI component skill. Use the free Magic UI components only. The registry (magicui.design / ui.shadcn.com) is blocked from cloud sessions; copy sources from raw.githubusercontent.com/magicuidesign/magicui/main/apps/www/registry/magicui/<slug>.tsx instead.

## Decisions (do not re-litigate without asking)
1. **Content is JSON in the repo**, not in the database. Supabase stores only per-user state keyed by the string question id (`dva-c03/lambda/0042`). A new course = a new folder under `content/`. Moving content into Postgres is a later one-time loader script for the SaaS idea.
2. **Scheduler: `ts-fsrs` pinned to 5.4.2** (FSRS-6), `request_retention: 0.9`, run on the client. Outcome → rating: wrong = Again; right+unsure = Hard; right+sure = Good. No Easy in v1. Leech at 4 lapses. Confident-wrong items get re-tested within ≤3 days regardless of interval.
3. **Session builder:** due reviews first (lowest retrievability first, interleaved across topics), then up to 10 new questions from unlocked sections, soft stop 25 min, hard stop 30 min. Shuffle choice order on every presentation.
4. **Gating:** a section unlocks when the previous section's quiz scores ≥ 80%; immediate retakes allowed. Daily review draws from all unlocked sections.
5. **Streak:** extends on ≥1 completed session (`daily_activity.sessions_completed`) or ≥5 answers; separate 20-minute daily goal ring (`goal_met`, does not affect the streak); 1 freeze earned per 7-day streak, max 2. Day rollover at 04:00 local (Asia/Dubai, UTC+4, no DST).
6. **i18n:** English canonical; Malayalam overlay in `content/<course>/i18n/ml/`, keyed by question id with `sourceHash` = English `contentHash`. `{{t:...}}` / `{{code:...}}` tokens are protected terms and are never translated. Stale translation → fall back to English for that question. UI strings via react-i18next; question content via a custom token-aware renderer (never through `t()`/`<Trans>`).
7. **Hosting:** Cloudflare (Workers with static assets, SPA fallback). **Stack:** Vite + React 19 + TypeScript 5.9.3 (pinned; npm `latest` is now 7.x native — don't upgrade mid-build), react-router, TanStack Query, @supabase/supabase-js 2.x, Zod 4, Tailwind 4 + shadcn-style components + Magic UI (free), vite-plugin-pwa (`registerType: 'prompt'`), idb-keyval outbox for offline answers, Recharts. Fonts self-hosted via Fontsource: Inter + Noto Sans Malayalam (`:lang(ml) { line-height: 1.75 }`).
8. **Exam version:** DVA-C02 last test date 2026-11-30; DVA-C03 GA 2026-12-01 (guide published 2026-10-27). Course folder is `dva-c03`; `course.json` is `provisional` until the guide drops — then update task statements, retag `taskId`s, add new-scope sections (Bedrock, AgentCore, Amazon Q, Kiro, Data Firehose, PrivateLink, AI security).

## Build status
Done (2026-10-20): everything in the Day 1 / Day 2 plan and the "later" list — auth (magic link + 6-digit code), study loop, section quiz + 80% gate, home dashboard, PWA, offline outbox, leech list, readiness + calibration, confident-wrong queue, 65-question timed mock, Malayalam UI + overlay renderer + fonts.
Hosting: Cloudflare Workers with static assets (`wrangler.jsonc`, `public/_headers`); not Vercel.
Not done: the first deploy (Cloudflare's API is unreachable from cloud sessions — connect the repo in the dashboard, README → Deploy); Malayalam *content* overlay files (none exist yet; the app falls back to English per question).
Still deferred: full ml translation, FSRS parameter optimisation, push reminders/pg_cron, leagues/XP, multi-course UI, content in DB, PowerSync/Electric, admin tooling.

Design choices made while building (medium/minor, revisit if they hurt):
- Local-first: the UI reads only the IndexedDB snapshot; Supabase is backup + multi-device sync. Streak/stats are computed client-side; the SQL `streak_status()`/`topic_stats()` mirror the same rules.
- Freezes are computed on read (walk the days; every 7th qualifying day earns one, max 2; a missed day spends one) — nothing is stored.
- Confident-wrong: `recheck_by = now + 3 days`; a correct answer within the first day keeps `due ≤ recheck_by`; a correct answer ≥ 1 day later clears it.
- Mock answers are logged (`mode = 'mock'`) but never change review states. Section-quiz and weak-spot answers do.
- Submit is two buttons ("I'm sure" / "not sure") instead of a toggle + submit: one tap, same data.
- Learning/relearning steps are a single `10m` step, so Good on a new card graduates it.
- Scaled mock score is a linear 100–1000 estimate, clearly labelled as such.

## Conventions
- Never edit a question's `id`. Material content edits → `changeKind: "material"` (app resets that card). Run `npm run content` after any content change; CI fails if that leaves a diff or the validator errors.
- Readiness score is computed client-side from `course.json` domain weights × per-topic accuracy (formula in SPEC §5). Don't put weights in the database.
- All user-scoped tables: `user_id uuid not null default auth.uid()`, RLS on, policy `using ((select auth.uid()) = user_id)`, index on `user_id`. Views `with (security_invoker = true)`.
- Attempts are append-only with client-generated UUIDs (idempotent sync). RLS allows only select + insert on `attempts`, so sync must use `upsert(..., { ignoreDuplicates: true })` (ON CONFLICT DO NOTHING), never a plain upsert/update. `review_states` is a derived cache rebuildable from attempts via `replay()` in `src/lib/scheduler.ts` (Settings → Rebuild).
- Commands: `npm run dev` · `npm test` (vitest) · `npm run typecheck` · `npm run build` (validate + tsc + vite) · `npm run content` (idempotent content pipeline — a clean tree stays clean) · `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test` (e2e in cloud sessions).
- Question generation: give Claude `AUTHORING.md` + `course.json`, one topic file per task, ~10 items each, then run an independent answer-key review pass before merging (LLM banks contain wrong keys; the seed bank went through that pass).
