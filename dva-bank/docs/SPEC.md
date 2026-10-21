# DVA Exam-Prep PWA: Technical Spec and MVP Plan (October 2026)

> Implemented 2026-10-20. Where the build deviated from or refined this spec (local-first store, computed freezes, `recheck_by`, two-button submit), `CLAUDE.md` → "Build status" lists the choices.

Research compiled 2026-10-20. Package versions in §(c) were confirmed with `npm view` on 2026-10-20. Bank sizes, the readiness formula and the leech threshold are engineering judgement, not AWS or FSRS guidance.

**Decide which exam version you're taking before you write any questions.** AWS announced that the last day to take DVA-C02 is **November 30, 2026**. DVA-C03 becomes generally available on **December 1, 2026**, and registration opens October 27, 2026 (the full C03 guide is published the same day). The app design below works for either version. The question bank does not, so the course folder is versioned (`dva-c02/`, `dva-c03/`).

## TL;DR

- **Exam:** DVA-C02 has 65 questions (50 scored, 15 unscored), 130 minutes, scaled score 100–1,000 with 720 to pass, four domains weighted 32/26/24/18. DVA-C03 keeps 65 questions, 130 minutes and 720, but changes the weights to 30/26/22/22. It adds AI-assisted development, a new AI-security task, and Bedrock/AgentCore/Q/Kiro/Firehose/PrivateLink. The core of Lambda, DynamoDB, IAM, KMS, API Gateway, SQS/SNS and CI/CD carries over either way.
- **Engine:** `ts-fsrs` 5.4.x (FSRS-6), pinned exactly, `request_retention` 0.9. Map each multiple-choice outcome plus the sure/unsure mark to a rating: wrong → Again, right + unsure → Hard, right + sure → Good. Store per-question FSRS state in Supabase keyed by the string question id, plus an append-only attempts log. Daily session = due reviews first, then up to 10–15 new questions, 30-minute cap. Skip ts-fsrs 6.0 for now (beta).
- **Stack and build:** Vite + React 19 + TypeScript, TanStack Query, Supabase (Auth + RLS), Zod-validated JSON content (one file per topic), react-i18next for UI text only, a custom term-aware renderer for Malayalam content, vite-plugin-pwa 2.0 for installability and app-shell caching, IndexedDB outbox for offline answers. Day 1: schema, loader, one session loop, persistence. Day 2: study, then dashboard and streak. Defer everything else.

## Key findings

1. **The exam version clock matters more than any technical choice.** AWS's September 1, 2026 announcement: DVA-C03 registration opens October 27, 2026; last day for DVA-C02 is November 30, 2026; DVA-C03 GA December 1, 2026. C03 weights: Development 30%, Security 26%, Testing and Deployment 22%, Troubleshooting and Optimization 22%. Until the full guide is out, treat any third-party C03 task list as speculation.
2. **FSRS is the right default, and `ts-fsrs` is the right library.** MIT-licensed, maintained by the open-spaced-repetition org; the stable 5.x line implements FSRS-6 (21 weights). The 6.0 line (multi-model, `card_id`-based fuzz, Temporal/elapsed-days input) is in beta with a stable target of October 28 — don't build on it this weekend.
3. **Nothing worth forking exists for DVA content.** Closest reusable codebase is CloudCertPrep (MIT; Astro + React islands, Supabase, one JSON per exam domain, a validator script). It only covers CLF-C02 and AIF-C01, and its issue tracker shows answer-key errors — a warning for any LLM-generated bank. Avoid the "DVA-C02 dumps" repos: unclear provenance and licensing, and memorising leaked items doesn't build the skill needed.
4. **Keep readiness math client-side.** Domain weights live in course JSON, so the readiness score belongs in the client. The database only produces per-topic aggregates.
5. **Use streaks that bend rather than break.** Duolingo's published A/B results: equipping up to two Streak Freezes raised daily active learners by about 0.38%; a "Weekend Amulet" made learners 4% more likely to return a week later and 5% less likely to lose their streak. Build a small freeze allowance into the MVP streak math.

## 1. DVA-C02 / DVA-C03: what the exam is and how to model it

### Official facts (DVA-C02 exam guide v2.1, revised December 12, 2024)

| Item | DVA-C02 |
|---|---|
| Questions | 65 total: 50 scored + 15 unscored (unscored ones aren't identified) |
| Types | Multiple choice (1 correct, 3 distractors); multiple response (2+ correct out of 5+ options) |
| Duration | 130 minutes |
| Scoring | Scaled 100–1,000; pass = 720; compensatory (no per-domain minimum) |
| Guessing | Unanswered = wrong; no guessing penalty |
| Emerging topics | AI-assisted dev, AI security, AI test generation may appear as **unscored** pretest items |

**Domains and task statements (C02):**
- **D1 Development with AWS Services, 32%.** 1.1 Develop code for applications hosted on AWS (messaging, SDK/API use, streaming, Amazon Q Developer, EventBridge event-driven patterns). 1.2 Develop code for AWS Lambda (VPC access, env vars/memory/concurrency/timeout/layers/extensions/destinations, testing, integrations). 1.3 Use data stores (DynamoDB keys and indexing, caching, specialised stores such as OpenSearch).
- **D2 Security, 26%.** 2.1 Authentication/authorisation (Cognito/IAM federation, bearer tokens, programmatic access, assuming roles, principal permissions, app-level fine-grained authz, cross-service auth). 2.2 Encryption (at rest/in transit, certificate management, client-side vs server-side, cross-account encryption). 2.3 Sensitive data in application code (secret management services).
- **D3 Deployment, 24%.** 3.1 Prepare artifacts (directory structure, repos, AppConfig per environment). 3.2 Test in dev environments (API Gateway stages, mocks and integration tests). 3.3 Automate deployment testing (test events, Lambda aliases, image tags, Amplify branches, SAM/CloudFormation IaC, Q Developer–generated tests). 3.4 Deploy with CI/CD (Lambda packaging, blue/green/canary/rolling, commit-triggered pipelines, rollbacks).
- **D4 Troubleshooting and Optimization, 18%.** 4.1 Root cause analysis (metrics/logs/traces, log queries, CloudWatch EMF custom metrics, dashboards, deployment-failure logs, integration debugging). 4.2 Instrument for observability (logging vs monitoring vs observability, structured logging, custom metrics, tracing annotations, alerts, health checks). 4.3 Optimise (caching including header-based, application-level caching, and similar).

**In-scope services (C02)** include Athena, Kinesis, OpenSearch, AppSync, EventBridge, SNS, SQS, Step Functions, EC2, Elastic Beanstalk, Lambda, ECR, ECS, EKS, Aurora, DynamoDB, ElastiCache, RDS, Amplify, CloudShell, CodeArtifact, CodeBuild, CodeDeploy, CodePipeline, X-Ray, Amazon Q Developer, AppConfig, CDK, CloudFormation, CloudTrail, CloudWatch, CLI, Systems Manager, API Gateway, CloudFront, Route 53, VPC, Cognito, IAM, KMS, Secrets Manager, STS, WAF, EBS, EFS and S3. Version 2.1 added Amazon Q Developer and removed Copilot and CodeGuru. Pull the authoritative list into `course.json` from the AWS page rather than retyping from memory.

**DVA-C03 (announced September 1, 2026):** same four domains, renamed and reweighted (30/26/22/22). New Task 2.3 covers AI security (5 skills). AI-assisted development appears across all domains, plus container work (ECR/ECS/EKS/Fargate). Newly in scope: Bedrock, Bedrock AgentCore, Amazon Q, Kiro, Data Firehose and PrivateLink. Out of scope: prompt engineering, RAG design, model selection and SageMaker AI. DynamoDB, security, testing, observability and optimisation skills were consolidated into fewer, broader skills. Format: 65 questions (50 scored), 130 minutes, $150, 720/1,000.

**Recommendation:** make `domain.tasks[]` the backbone of the taxonomy, because AWS revises the guide at that level. Tag every question with its `taskId`, not just a service. When C03 lands, a mapping file retags questions instead of rewriting them.

### Question style (paraphrased)
- Stem = short scenario, 2–5 sentences: a developer with a constraint (latency, cost, least privilege, minimal code change). Ends with a qualifier: *MOST cost-effective*, *LEAST operational overhead*, *MOST secure*, *fewest code changes*. The qualifier decides between two technically valid answers.
- Distractors are "plausible to someone with incomplete knowledge": real services used slightly wrong (wrong encryption mode, stage vs alias mix-up).
- Multiple-response items say "Choose TWO/THREE" and are all-or-nothing.
- The generator prompt should require a qualifier on ≥70% of items and require each distractor's explanation to say *why it's wrong under this qualifier*.

### Bank size and taxonomy (recommendation)
Target **about 600–750 scored-quality questions**, allocated by weight with a floor per task:

| Domain | Weight (C02) | Target | Heavy topics |
|---|---|---|---|
| D1 Development | 32% | ~220 | Lambda (60), DynamoDB (55), SQS/SNS/EventBridge/Kinesis (45), S3/SDK/caching/Step Functions (60) |
| D2 Security | 26% | ~180 | IAM/STS (55), Cognito (40), KMS/encryption (45), Secrets Manager/Parameter Store (40) |
| D3 Deployment | 24% | ~165 | CodePipeline/Build/Deploy (60), SAM/CloudFormation/CDK (45), API Gateway stages/Lambda aliases (35), Elastic Beanstalk/AppConfig/containers (25) |
| D4 Troubleshooting | 18% | ~125 | CloudWatch Logs/Metrics/EMF (50), X-Ray (35), optimisation/caching/concurrency (40) |

Rules: ≥15 questions per task statement, ~25% multiple-response, difficulty ~30/50/20. Daily throughput is the real limit: exam pace is 2 min/question, reading explanations takes longer, so a 30-minute session holds ~10–12 questions. At 10 new/day plus reviews, 700 questions takes ~10 weeks.

**Taxonomy:** `course → domain (weight) → section (gated unit; 1–3 per task) → question`, with `services[]` and `taskId` as tags. Services cut across domains (KMS in D1 and D2, Lambda everywhere), so a service folder level would force duplication.

## 2. Spaced repetition: FSRS and `ts-fsrs`

### Library status (October 2026)
- **ts-fsrs 5.4.2** (September 1, 2026) is the latest stable release, implementing **FSRS-6** (21 weights). FSRS-5 parameters (19 weights) auto-fill to 21 with a warning. MIT, ESM/CJS/UMD, Node ≥ 20.
- **6.0.0-beta.x** adds multi-model support, `card_id` for stable per-card fuzz, `elapsedDays`/Temporal inputs that fix server-UTC vs user-local drift, standard-schema validation, and simplifies the `FSRS` class to `next`/`repeat`/`forget`/`rollback`/`reschedule`/`retrievability`. Node 24. Stable targeted October 28. **Pin `ts-fsrs@5.4.2` exactly**; a version bump changes scheduling output.
- **Optimiser:** `@open-spaced-repetition/binding` (WASM) trains personal weights from review logs — for later, after a few thousand reviews.

### API surface
```ts
import { fsrs, createEmptyCard, Rating, State, type Card } from 'ts-fsrs'
const scheduler = fsrs({
  request_retention: 0.9,      // target recall probability at review time
  maximum_interval: 180,       // exam horizon; default is 36500 days
  enable_fuzz: true,           // only affects intervals ≥ ~2.5 days
  enable_short_term: true,
  learning_steps: ['10m'],     // default ['1m','10m'] is too twitchy for MCQs
  relearning_steps: ['10m'],
})
const card = createEmptyCard(now)                                   // State.New
const { card: next, log } = scheduler.next(card, now, Rating.Good)  // apply known rating
scheduler.get_retrievability(next, now, false)                      // 0..1 — readiness / at-risk
scheduler.forget(card, now, true)                                   // reset after a material rewrite
scheduler.reschedule(card, reviews)                                 // rebuild state from logged reviews
```
- **Persist:** `due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review` (Dates as `timestamptz`).
- **States:** `New → Learning → Review`, `Review → Relearning` on a lapse. **Ratings:** `Again=1, Hard=2, Good=3, Easy=4`.

### Mapping exam questions to ratings
| Outcome | Rating | Extra |
|---|---|---|
| Wrong (any confidence) | Again | if marked *sure*: flag `confident_wrong`, emphasise the explanation |
| Right, marked *unsure* | Hard | counts as "lucky" → shorter interval |
| Right, marked *sure* | Good | |
| Right, *sure*, under 50% of median time | Good (no Easy in MVP) | add Easy later if calibration data warrants |

Multiple-response is all-or-nothing, matching the exam. **Shuffle choice order on every presentation.**

### Leeches and lapses
FSRS has no built-in leech concept; `lapses` is the counter. Mark `is_leech` at `lapses ≥ 4`. Suspend from the daily queue, show in a "Leeches" view, and treat as a content signal: with LLM-generated content a leech is often a bad item, not a weak learner.

### Daily session builder
1. `due ≤ end_of_local_day` reviews, lowest retrievability first, interleaved across topics. No cap except the time cap.
2. New questions up to `new_per_day` (default **10**, range 5–20) from *unlocked* sections, interleaving 2–3 topics.
3. Time cap: stop pulling new items at 25 minutes, hard stop at 30. Unfinished due items roll over.
4. In-session relearning: a wrong answer re-enters the queue once, ≥5 items later.
5. Load-balance: if tomorrow's forecast due count exceeds ~40, halve today's new cap.

### Gotchas
- **Day boundaries.** `local_date = (ts AT TIME ZONE tz − 4h)::date` — 4 a.m. rollover. Asia/Dubai is UTC+4 with no DST. Store `timezone` per user anyway. Run the scheduler on the client.
- **Fuzz** is random: store the computed card, not just the rating.
- **Edits.** `contentHash` changed + `material` → `forget()`. `cosmetic` → keep state. Never reuse an id.
- **Retention target.** 0.9 default; go to 0.92–0.95 only in the final two weeks — workload rises sharply above 0.9.

### FSRS vs SM-2
SM-2 (1987) updates one ease factor per card with fixed formulas and has no retention target. FSRS models difficulty, stability and retrievability, fitted on hundreds of millions of Anki reviews, and schedules to hit the retention you set. The FSRS team's own benchmark reports FSRS-6 beating SM-2 for ~99.6% of users on log loss (caveats: SM-2 wasn't designed to predict probabilities; the benchmark is run by the FSRS authors). Practical reasons: it's Anki's modern scheduler, it yields retrievability for readiness, and the library is typed and maintained.

**Alternatives:** `recall-srs` (FSRS + SM-2, headless React, Supabase schema sketch) is early and its Supabase adapter is a skeleton. For a JS web app, nothing beats ts-fsrs.

## 3. Open-source projects worth borrowing from

| Project | What | License / status | Borrow |
|---|---|---|---|
| open-spaced-repetition/ts-fsrs + ts-fsrs-demo | Scheduler + full-stack demo | MIT, very active | Card persistence patterns, review-log shape |
| nastaso/cloudcertprep | AWS practice-exam app: Astro + React islands, Supabase auth, per-cert/domain JSON, `validate-questions.mjs`, guest mode offline | MIT, active; CLF/AIF only | Folder-per-domain layout, validator-in-CI, "report error with pre-filled question id" link, timed mock UI |
| Sthabiso10/recall-srs | Headless React SRS, adapters | Early | Supabase `schema.sql`/RLS sketch, component boundaries |
| Anki | Reference SRS | AGPL-3.0 | Concepts only |
| "DVA-C02 dumps" repos | Scraped Q&A | Unclear provenance | **Avoid** |

Verdict: **don't fork.** Copy ideas from CloudCertPrep (validator, per-question error links).

## 4. JSON content schema

### Survey
- **1EdTech QTI 3.0:** XML interchange standard; too heavy to author or LLM-generate.
- **Moodle GIFT / XML:** compact; no first-class per-choice explanations or i18n overlays.
- **Open Trivia DB style:** simple; can't do multiple-response, no stable ids, no explanations.
- **Anki exports:** note/card model, not MCQ.
- **CloudCertPrep:** pragmatic per-domain JSON with a validator; closest precedent.

Recommendation: **custom JSON validated by Zod** (`schema/content.ts`), with a generated JSON Schema (`z.toJSONSchema()` in Zod 4) for editor autocomplete and for constraining Claude's structured output.

### Folder layout (implemented)
```
content/dva-c03/
  course.json           metadata, domains+weights, task statements, sections (order, gating)
  glossary.json         protected terms (shared across locales)
  manifest.json         generated: per-file hash + counts (precached by the service worker)
  topics/<section>.json one file per section, ~10–60 questions
  i18n/ml/<section>.json overlay keyed by question id
scripts/  validate.ts · validate-topic.ts · hash.ts · normalize.ts · build-glossary.ts · build-manifest.ts
```
One file per topic: reviewable diffs, topic-by-topic generation, lazy loading per section, small merge conflicts.

### Content hash and versioning (implemented)
- `id`: `"dva-c03/lambda/0042"`. Immutable. Never reused (`retired: true` instead).
- `contentHash`: sha256 of canonical English `stem + type + selectCount + choices (id, text, correct, explanation, sorted by id) + explanation`. Tags, difficulty, references and meta are excluded so retagging never resets review state. Computed by `scripts/hash.ts`, never hand-authored.
- `revision` + `changeKind: "cosmetic" | "material"`. Client compares stored `content_hash` on the review state: mismatch + `material` → reset the FSRS card; `cosmetic` → update the hash silently.
- Translations store `sourceHash` = the English `contentHash`; mismatch marks the translation stale and the app falls back to English for that item.
- Choice ids (`a`–`f`) are stable across shuffles and translations. Attempts store selected choice ids, never positions.

Zod rules enforced: single = exactly 4 choices and 1 correct; multi = ≥5 choices, `selectCount` correct, stem says "Choose TWO/THREE"; every choice has an explanation; ids unique and matching `^[a-z0-9-]+/[a-z0-9-]+/\d{4}$`; `taskId` exists in `course.json`; `{{...}}` only in well-formed tokens; ml token multisets equal the English source.

## 5. Supabase schema and app architecture

### Principles
- No `questions` table. `question_id text` is an external key validated client-side against the manifest.
- Write-heavy data is append-only (`attempts`). `review_states` is a derived cache rebuildable from attempts via `reschedule()`.
- Every user-scoped table: `user_id uuid not null default auth.uid()`, RLS on, policy `using ((select auth.uid()) = user_id)` (the `select` wrapper lets Postgres cache the call per statement). Btree index on `user_id`. Already SaaS-ready.
- Views `with (security_invoker = true)` so they respect RLS.
- `attempts` is append-only at the policy level: RLS grants select + insert only. Sync inserts with ON CONFLICT DO NOTHING.
- **No pg_cron for the MVP.** Compute streaks on read from `daily_activity`. Add cron/Edge Functions later for reminders and weekly summaries.

### SQL sketch
```sql
create view due_today with (security_invoker = true) as
select question_id, due, state, lapses
from review_states r join profiles p using (user_id)
where not r.suspended
  and r.due < ((now() at time zone p.timezone - interval '4 hours')::date + 1 + interval '4 hours')
              at time zone p.timezone;

-- streak: consecutive local_dates with sessions_completed >= 1 or answered >= 5; freezes are computed on read
-- (every 7th qualifying day in a row earns one, max 2; a missed day spends one)
-- (goal_met is the separate daily-goal ring and does not count toward the streak)
create function streak_status() returns table(current int, longest int, today_done bool)
language sql stable security invoker as $$ ... gaps-and-islands over daily_activity ... $$;
```
`topic_stats()` RPC returns per `(domain_id, topic_id)`: attempted, correct over the last N attempts, mean retrievability input, confident_wrong. The client applies the domain weights.

**Readiness (client):** per domain *d*, `mastery_d = Σ_topics share_t × acc_t` where `acc_t` is accuracy over each question's most recent attempt, discounted for questions not seen in 14+ days. `coverage_d = seen ÷ bank`. `readiness = Σ w_d × (coverage_d × mastery_d + (1 − coverage_d) × 0.25)` (0.25 = guess rate). Show as an estimated 1,000-point scale with a caveat; aim for ≥85% before booking.

**Calibration:** track `P(correct | sure)` and `P(correct | unsure)` plus the confident-wrong rate. Well-calibrated ≈ 90%+ vs 50–60%.

### Frontend stack (leanest viable)
- **Vite + React 19 + TypeScript.** react-router (or TanStack Router). ~6 routes.
- **Data:** TanStack Query for Supabase reads. Content JSON via `fetch`, cached by the service worker (cache-first, versioned by manifest hash).
- **Offline:** session built client-side from cached content + the last-synced `review_states` snapshot in IndexedDB. Each answer (1) updates the local card via ts-fsrs and (2) appends an attempt with a client-generated UUID to an IndexedDB outbox (idb-keyval). Flusher runs on `online` and app focus; upserts attempts (idempotent on `id`) and `review_states` (last-write-wins on `updated_at`). Later upgrades if multi-device/SaaS: PowerSync, ElectricSQL or TanStack DB.
- **PWA:** vite-plugin-pwa (Workbox), `registerType: 'prompt'` (never a mid-session reload). Precache app shell, fonts, manifest; content runtime cache-first.
- **UI:** Tailwind 4 + shadcn-style copy-in components + Magic UI (free). Avoid big kits.
- **Charts:** Recharts (domain bars, readiness trend, calendar heatmap or a CSS-grid heatmap).

## 6. i18n with mixed Malayalam/English

- **UI strings:** react-i18next, `fallbackLng: 'en'`, namespaces `common` and `study`. Plurals via built-in `Intl.PluralRules`; skip ICU in the MVP.
- **Content is not UI strings.** Don't push question text through `t()`/`<Trans>` (tag parsing and escaping issues). Load the overlay JSON and render with a tiny custom renderer.
- **Protected terms:** `{{t:Amazon DynamoDB}}`, `{{code:ReturnConsumedCapacity}}` → `<span lang="en" dir="ltr" class="term">`. `glossary.json` lists canonical terms with optional Malayalam glosses (shown on tap, never substituted). CI check: the multiset of tokens in each translated field must equal the English source's; any run of Latin letters outside a token in Malayalam text is a warning.
- **Fallback:** per question, use `ml[id]` only if `sourceHash === en.contentHash`; otherwise show English with a small "EN" badge. Per-question "show English" toggle. Keep a "practice in English" mode one tap away — exam day is English.
- **Fonts:** Noto Sans Malayalam (OFL, variable) for body; Manjari or Gayathri (SMC, OFL) as rounder alternatives; Chilanka only for playful headings. Self-host via Fontsource. Stack: `font-family: 'Inter', 'Noto Sans Malayalam', system-ui, sans-serif;` so Latin renders in the Latin face and Malayalam code points fall through.
- **Typography:** `:lang(ml) { line-height: 1.75 }` (vs ~1.5 for English), ~1.05–1.1× font size for equal visual weight, no `letter-spacing` (breaks shaping), `overflow-wrap: anywhere` for long API names. Test chillu letters and conjuncts in buttons; fixed-height choice buttons clip them.
- **LLM translation pipeline:** `scripts/translate.ts` batches ~20 questions per call with the glossary and rules (keep every `{{…}}` token byte-identical; don't translate AWS service/API/CLI/config/error names even if unmarked), validates token multisets and schema, stamps `sourceHash`, marks `reviewed:false`; spot-check ~10%.

## 7. Learning science: why the defaults are what they are

- **Testing effect and spacing:** Dunlosky et al. (2013) rated practice testing and distributed practice the only two high-utility techniques of ten; interleaving moderate; rereading and highlighting low. Hence "questions are the lesson" and the review-first session.
- **Interleaving:** mix 2–3 topics per new batch once a section has been introduced; most useful for discriminating similar options (SQS vs SNS vs EventBridge).
- **Confidence and hypercorrection:** high-confidence errors are more likely to be corrected after feedback (Butterfield & Metcalfe, 2001), but some return over a week (Butterfield & Mangels, 2011). So: always show full feedback after a confident-wrong answer, rate it Again, re-test within 1–3 days regardless of interval, weight it heavily in "weak spots".
- **Duolingo mechanics (company-reported A/B tests):** Streak Wager raised Day-7 retention ~14%; Weekend Amulet +4% return / −5% streak loss; two equipped Streak Freezes +0.38% daily active learners; separating the streak from the daily goal (any lesson extends the streak) increased 7+ day streaks by over 40%. Defaults here: streak extends on ≥1 session or ≥5 answers; daily goal (20 min) is a separate ring; 1 freeze per 7-day streak, max 2; one daily reminder at a chosen time (needs push/Edge Functions — defer).
- **Defaults summary:** retention 0.90 · new/day 10 (5–20) · session cap 30 min (soft 25) · section gate 80% on a 10–15 question quiz with immediate retakes · leech at 4 lapses · confident-wrong re-check ≤3 days.

## (a) JSON schema — see `schema/content.ts` and `AUTHORING.md` (worked example included).

## (b) Supabase tables (key columns) — see `supabase/migrations/0001_init.sql`

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `user_id pk → auth.users`, `timezone` (default `Asia/Dubai`), `day_rollover_hour` (4), `locale`, `new_per_day` (10), `daily_goal_min` (20), `desired_retention` (0.9), `active_course` | One row per user |
| `review_states` | pk (`user_id`, `question_id`), `course_id`, `content_hash`, FSRS fields (`state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, last_review`), `is_leech`, `suspended`, `updated_at` | Index `(user_id, due)`; derived, rebuildable |
| `attempts` | `id uuid pk` (client-generated), `course_id`, `question_id`, `content_hash`, `session_id`, `mode`, `selected text[]`, `correct`, `confidence`, `rating`, `time_ms`, `answered_at`, `local_date`, `domain_id`, `task_id`, `section_id` | Append-only; denormalised tags for analytics |
| `sessions` | `id`, `local_date`, `kind`, `started_at`, `ended_at`, `planned_due`, `planned_new`, `answered`, `correct` | |
| `daily_activity` | pk (`user_id`, `local_date`), `answered`, `correct`, `sessions_completed`, `minutes`, `goal_met` | Upserted by the client after each session |
| `section_progress` | pk (`user_id`, `course_id`, `section_id`), `best_pct`, `attempts`, `passed_at` | Drives unlock gating |
| Views/RPCs | `due_today`, `streak_status()`, `topic_stats(course_id)` | Readiness weights applied client-side |

## (c) Library and stack list (confirmed with `npm view` on 2026-10-20)

| Package | Version | Notes |
|---|---|---|
| vite | 8.3.x | `npm create vite@latest` |
| react / react-dom | 19.3.1 | |
| typescript | **5.9.3** exactly | npm `latest` is 7.0.2 (native Go compiler) and 6.0.3 also exists; stay on 5.9 for tooling compatibility |
| react-router | 8.5.x | Import from `react-router` only; there is no `react-router-dom` v8 (last is 7.18.x) |
| @tanstack/react-query | 5.104.x | |
| @supabase/supabase-js | 2.118.0 | 3.0 pre-release exists; stay on 2.x |
| ts-fsrs | **5.4.2** exactly | FSRS-6; v6 stable targeted 2026-10-28 |
| zod | 4.6.7 | `z.toJSONSchema()` for generator prompts |
| vite-plugin-pwa | 2.0.0 | Node ≥ 20.19 |
| i18next / react-i18next | 26.5.x / 17.1.x | i18next-icu later if needed |
| idb-keyval (or dexie) | 6.3.x (4.4.x) | idb-keyval is enough for an outbox |
| tailwindcss | 4.3.3 | |
| recharts | 3.10.1 | |
| @fontsource-variable/noto-sans-malayalam, @fontsource-variable/inter | latest | Self-hosted, offline |
| Node | 22 or 24 LTS | |

## (d) Timeboxed MVP build plan

**Day 1 (~8–10 h): everything needed to answer a question and have it remembered.**
1. (1h) Scaffold: Vite + React + TS + Tailwind, Supabase project, magic-link auth, `profiles` row on first login.
2. (1.5h) Migration: `profiles`, `review_states`, `attempts`, `sessions`, `daily_activity`, `section_progress` + RLS + indexes (already written in `0001_init.sql`; apply it). `supabase gen types`.
3. (1.5h) Content: load `course.json` + topic files through the Zod schema; the seed bank is already here.
4. (2.5h) Study loop: session builder (due → new, caps) → question card (stem, shuffled choices, single/multi select, sure/unsure toggle *before* submit) → reveal (correct choices, per-choice explanations, references) → rate via ts-fsrs → persist attempt + state (online-only for now).
5. (1h) Section quiz mode + 80% gate + `section_progress`.
6. (0.5h) Deploy to Cloudflare (Workers static assets; see README → Deploy).

**Day 2: study first.** Do a real session in the morning. Then generate 2–3 more topics with Claude using `AUTHORING.md`. Afternoon (~3h): home screen with due count, streak, daily goal ring, domain-accuracy bars. Evening (~1h): vite-plugin-pwa.

**Week 1 increments (≤30 min each, only when the friction is real):** IndexedDB outbox · leech list · readiness + calibration card · confident-wrong queue · timed 65-question mock · Malayalam overlay + renderer + fonts.

**Defer:** ml translation of the full bank · FSRS parameter optimisation · push reminders/pg_cron · leagues/XP · multi-course UI · content in the database · PowerSync/Electric/TanStack DB · admin/review tooling beyond the CLI validator.

## Caveats
- DVA-C03 task statements are unpublished until 2026-10-27; C03 details above come from AWS's announcement.
- Bank sizes, readiness formula and leech threshold are engineering judgement; calibrate against a real mock score.
- FSRS benchmark figures are from the FSRS team; Duolingo figures are company-reported A/B results on language learners.
- LLM-generated questions contain wrong answer keys. `references[]` is mandatory, `reviewed:false` stays visible, and leeches / confident-wrong clusters are audited as content first.

## Sources (selected)
- AWS: September 2026 certification offerings announcement (aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/); DVA-C02 exam guide and in-scope services (docs.aws.amazon.com/aws-certification/latest/developer-associate-02/); certification page (aws.amazon.com/certification/certified-developer-associate/).
- ts-fsrs: open-spaced-repetition.github.io/ts-fsrs/, github.com/open-spaced-repetition/ts-fsrs, npmjs.com/package/ts-fsrs, github.com/open-spaced-repetition/awesome-fsrs.
- CloudCertPrep: github.com/nastaso/cloudcertprep; recall-srs: github.com/Sthabiso10/recall-srs.
- Supabase RLS patterns; vite-plugin-pwa releases; react-i18next issues #1686 and #1893; Fontsource Noto Sans Malayalam.
- Dunlosky et al. 2013 (pmc.ncbi.nlm.nih.gov/articles/PMC4036076); Butterfield & Mangels 2011 (link.springer.com/article/10.3758/s13423-011-0173-y); Duolingo blog: "How Duolingo streak builds habit", "How Streaks keep Duolingo learners committed", "Improving the streak".
