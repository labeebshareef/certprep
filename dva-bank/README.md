# CertPrep: AWS Developer Associate exam prep

A local-first PWA for spaced-repetition practice on the AWS Certified Developer – Associate exam. Questions are JSON in this repo; Supabase stores only per-user study state keyed by question id.

Start here: `CLAUDE.md` (decisions, status, conventions) → `docs/SPEC.md` (research and spec) → `AUTHORING.md` (question format).

## What it does
- **Daily session.** Due reviews come first, lowest recall probability first and interleaved across topics, then up to 10 new questions from unlocked sections. You submit each answer as either *sure* or *not sure*, then see an explanation for every choice. Missed questions come back later in the same session. New questions stop at 25 minutes and the session ends at 30.
- **Scheduling.** FSRS-6 via `ts-fsrs` 5.4.2 at 0.9 target retention. Wrong = Again, right but unsure = Hard, right and sure = Good. A confident wrong answer comes back within 3 days. A question becomes a leech after 4 lapses.
- **Sections.** Each section has a 10-question quiz. Scoring 80% unlocks the next section.
- **Mock exam.** 65 questions in 130 minutes, weighted by domain. It survives a reload and has a full answer review at the end.
- **Dashboard.** Due and new counts, streak with freezes, a 20-minute daily goal ring, an exam-readiness estimate, per-domain mastery, calibration, a 7-day review forecast and a 12-week activity heatmap.
- **Review.** A confident-wrong queue, recent misses and a leech list (reset a leech, or report the item as a GitHub issue).
- **Offline and installable.** Every answer is saved to IndexedDB first and synced in the background. The whole question bank is precached by the service worker.
- **English / Malayalam UI.** A per-question Malayalam content overlay falls back to English when it's stale. AWS terms are never translated.

## Layout
```
src/                  the app (Vite root is this folder)
  lib/                pure logic + unit tests (scheduler, session, stats, store, sync, content, time)
  state/app.tsx       auth, per-user local store, background sync
  routes/             Home, Study/Quiz/Practice, Sections, Review, Mock, Settings, Login
  components/         QuestionCard, SessionRunner, Layout, ui/ (shadcn-style), magicui/ (vendored, MIT)
  i18n/               en.ts (canonical), ml.ts (unreviewed)
e2e/                  Playwright tests; Supabase is stubbed at the network layer
content/dva-c03/      course.json, glossary.json, manifest.json, topics/*.json, i18n/ml/*.json (none yet)
schema/content.ts     Zod schema, shared by the CLI validator and the app loader
scripts/              validate · validate-topic · hash · normalize · build-glossary · build-manifest
supabase/             migrations (applied to project uzmadqbamyryefhayyzy) + README
docs/                 SPEC.md, REVIEW-LOG.md
```

## Develop
```
npm install
cp .env.example .env          # set VITE_SUPABASE_ANON_KEY to the project's sb_publishable_... key
npm run dev                   # http://localhost:5173
npm test                      # unit tests
npm run typecheck
npm run build                 # validate content + tsc + vite build → dist/
npx playwright test           # e2e (needs `npx playwright install chromium` once)
npm run content               # after editing questions: normalize, hash, validate, glossary, manifest
```

## Supabase auth settings (one-time, in the dashboard)
1. **Authentication → URL Configuration.** Set *Site URL* to the deployed origin, and add both the deployed origin and `http://localhost:5173` to *Redirect URLs*. Without this, magic links point at the default `localhost:3000`.
2. **Optional: sign in with a code.** In *Authentication → Emails → Magic Link*, add `{{ .Token }}` to the template so the email also contains a 6-digit code. The sign-in screen already accepts codes.
3. The built-in email sender is rate-limited. Add custom SMTP before inviting anyone else.

## Deploy (Cloudflare Workers, static assets)
`wrangler.jsonc` serves `dist/` from Cloudflare's edge with an SPA fallback. `public/_headers` sets the cache headers: hashed assets are immutable and `sw.js` is `no-cache`, so updates are picked up.

**Recommended: Git deploys (Workers Builds).** In the Cloudflare dashboard, go to *Workers & Pages → Create → Import a repository* and pick `labeebshareef/certprep`. Then:
- **Root directory:** `dva-bank`
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy` (the default)
- **Build variables** (the Vite build bakes these in, so they must be build-time variables, not runtime secrets):
  - `VITE_SUPABASE_URL` = `https://uzmadqbamyryefhayyzy.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = the `sb_publishable_…` key

Every push to `main` deploys to `https://certprep.<your-subdomain>.workers.dev`. Other branches get preview URLs. You can attach a custom domain under the Worker's *Settings → Domains & Routes*.

**Manual alternative:** run `npx wrangler login`, then `npm run deploy` (with `.env` filled in).

**Local check of the production setup:** `npm run build && npm run serve:cf` serves the build through Wrangler at http://localhost:8787.

After the first deploy, add the `workers.dev` URL (and any custom domain) to Supabase's Site URL and Redirect URLs, as described above.

## Editing questions
- `id` is immutable. Retire a question with `"retired": true`; never reuse an id.
- For a material edit (stem, choices, key or explanation meaning), bump `revision` and set `changeKind: "material"`. The app then resets that question's review state. Use `"cosmetic"` for typos.
- Run `npm run content` after every edit. CI fails if it leaves a diff or the validator reports errors.
- Anything that must stay English goes in `{{t:...}}` (names) or `{{code:...}}` (identifiers). Those are the only places `{{` may appear.

## Status
- **Exam guide.** The DVA-C03 exam guide is published on 2026-10-27. `course.json` is `provisional` until then: weights are 30/26/22/22 and task statements are carried over from C02 v2.1. After the guide drops, update the tasks, retag `taskId`s, and add sections for the new scope.
- **Seed bank.** 85 questions, written by Claude and given an independent answer-key review (`docs/REVIEW-LOG.md`), but not yet reviewed by a human (`reviewed: false`). If an item turns into a leech or a confident-wrong cluster, audit the question first.
