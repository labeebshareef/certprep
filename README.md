# CertPrep

A spaced-repetition study app for the **AWS Certified Developer – Associate** exam (DVA-C02 → DVA-C03). It's an installable, offline-capable web app: questions live as JSON in this repo, and your study progress syncs through Supabase.

The app and everything it needs lives in [`dva-bank/`](dva-bank/).

## Features
- **Daily sessions.** Due reviews first, then up to 10 new questions. You submit each answer as *sure* or *not sure*, then see an explanation for every choice. Missed questions come back later in the same session. Sessions are capped at 30 minutes.
- **FSRS scheduling** (`ts-fsrs` 5.4.2, FSRS-6) at a 90% target retention. Confident mistakes come back within 3 days; questions you keep missing are moved to a leech list for review.
- **Gated sections.** Pass a section's quiz with 80% to unlock the next one.
- **Timed mock exam.** 65 questions in 130 minutes, weighted by exam domain, with a full review afterwards.
- **Dashboard.** Streak (with freezes), daily goal, exam-readiness estimate, per-domain mastery, calibration, review forecast and an activity heatmap.
- **Works offline.** Answers are saved on the device and synced when you're back online. The whole question bank is cached.
- **English or Malayalam interface.** AWS terms always stay in English.

## Stack
Vite · React 19 · TypeScript · Tailwind 4 · TanStack Query · Supabase (Auth + Postgres with RLS) · Zod · vite-plugin-pwa · Recharts · Magic UI. Hosted on **Cloudflare Workers** (static assets).

## Repository layout
```
dva-bank/
  src/                  the app (logic in src/lib, screens in src/routes)
  content/dva-c03/      question bank: course.json + one JSON file per section
  schema/content.ts     Zod schema for the question format
  scripts/              content pipeline: validate, hash, glossary, manifest
  supabase/migrations/  database schema (applied to the hosted project)
  e2e/                  Playwright tests (Supabase stubbed)
  docs/SPEC.md          research and technical spec
  CLAUDE.md             decisions, build status and conventions
  AUTHORING.md          how questions are written
.github/workflows/ci.yml  content check, typecheck, unit + e2e tests, build
```

## Quick start
```bash
cd dva-bank
npm install
cp .env.example .env    # set VITE_SUPABASE_ANON_KEY (Supabase → Settings → API → publishable key)
npm run dev             # http://localhost:5173
npm test                # unit tests
npm run build           # validate content, typecheck, production build
```
After editing questions, run `npm run content`. CI fails if it leaves a diff or the validator reports errors.

## Deploy (Cloudflare)
Connect this repo under **Workers & Pages → Create → Import a repository** with:

| Setting | Value |
|---|---|
| Root directory | `dva-bank` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Every push to `main` then deploys. After the first deploy, add the site URL to Supabase under **Authentication → URL Configuration** (Site URL and Redirect URLs) so sign-in links come back to the app. More detail is in [`dva-bank/README.md`](dva-bank/README.md#deploy-cloudflare-workers-static-assets).

## Status
- **App:** the study loop, quizzes, mock exam, dashboard, offline sync and PWA are all built. CI is green.
- **Question bank:** 85 seed questions covering the core shared by C02 and C03. They're AI-written with an independent answer-key review, but not yet reviewed by a person.
- **Exam guide:** the DVA-C03 guide is published on 2026-10-27; new-scope sections will be added after that.
- **Malayalam:** the interface strings are unreviewed, and no question translations exist yet.
