# IITM BS Data Science Mock Examination Platform

This repository imports an existing application for end-term evaluation. Its commits group the source by component; they do not reproduce the original development timeline. The deployed service is maintained separately. Production credentials, private records, backups, and operational scratch files are excluded. To run a separate instance, copy `.env.example` to `.env.local` and configure your own Supabase project.

A secure, high-performance web-based examination platform engineered for students, testers, and administrators of the IIT Madras BS in Data Science and Applications program.

The platform replicates the rigor of official university examinations in a distraction-free, browser-based environment. It supports multi-subject combined examination windows, complex LaTeX mathematical typography, code snippets, visual assets, non-blocking background autosave, anti-cheating telemetry, automated server-side evaluation, flexible practice Test Assignments, comprehensive Student Exam History & Answer Review, and detailed Admin Question-Wise Results analytics.

---

## Current Status

- **Release:** `main` includes atomic exam submission (reliability commit `b7e9eb7`) and shared light/dark appearance across admin, student, authentication, and exam screens. Check the active Vercel deployment commit before confirming production rollout.
- **Database:** 47 migrations through `20261024000047_attempt_subject_review_visibility.sql`; migration 44 fixes authoring/publishing trigger search paths and permits image-only questions.
- **Question images:** Questions and options start as text. Choose Image to upload a diagram instead, optionally add text, and adjust its student display size. See [Question authoring](docs/FEATURES.md#question-authoring) for usage, limits, and verification.
- **Appearance:** The device theme is used initially. The header sun/moon button saves an explicit light/dark choice in browser storage (`iitm-theme`), shared across roles and tabs on the same origin. Academic images retain their original white canvas for readability.
- **Verification:** ESLint, TypeScript, production build, and theme preference behavior are checked for this release. Earlier unit/database checks are recorded in the project history; authenticated visual verification remains a manual release check.
- **Production checks:** Follow [Production checklist](docs/PRODUCTION_CHECKLIST.md) and [Full manual checklist](docs/MANUAL_TESTING_CHECKLIST.md).
- **Capacity:** Local synthetic testing supported 300 concurrent exam-page loads and submissions spread over three seconds; a same-instant submission burst had 35 initial failures out of 300 before recovery. This does not certify hosted production capacity. The disposable load-test app, scripts, fixture, and Docker volumes have been removed; no hosted load test was run.

---

## Platform Overview & Capabilities

The platform is purpose-built for students at **Scaler School of Technology** preparing for **IIT Madras (IITM) BS in Data Science and Applications** examinations. It unifies mock exam practice, assessment event administration, academic resource dissemination, and structured student-to-faculty feedback.

### 1. Student Experience
- **Multi-Subject Combined Exam Window:** Students select 1 to 4 eligible enrolled subjects and sit them in a single combined window sharing a unified global timer, top-level tabs, and one final submission.
- **Dynamic Exam Clock:** Authoritative server-side duration (`Math.max(90, subjectCount * 60)` minutes for production; custom duration for test assignments). Browser clock is display-only.
- **Interactive Question Palette:** Real-time visual tracking across 4 question states: Not Visited (gray), Not Answered (red), Answered (green), and Marked for Review (yellow/purple).
- **Non-Blocking Background Autosave:** Client queue debounces and asynchronously commits answers to PostgreSQL via atomic stored procedures (`save_response`) with exponential backoff on network dropouts.
- **Server-Rendered KaTeX Math:** Mathematical equations pre-render to sanitized HTML on the server, eliminating client-side rendering lag while students navigate questions.
- **Direct CDN Image Delivery:** Exam figures stream directly from the Supabase Storage CDN via server-batched signed URLs, bypassing application proxy bottlenecks.
- **On-Demand Scientific Calculator:** Clean in-exam floating scientific calculator code-split via `next/dynamic` and loaded only when opened.
- **Immediate Evaluation & Transcripts:** Detailed score breakdown and percentage per subject upon submission.

### 2. Student Exam History & Answer Review
- **Dual-Section Results Portal:** `/student/results` provides an **Official Results** view for production examinations and a dedicated **Exam History & Review** tab containing all completed attempts across both Production and Test assignments.
- **Strict Answer-Release Security:** Production examination answer keys and explanations are guarded server-side; they are released only when the assessment event status is `Completed` and `release_answers = true`. Test assignments release answers immediately upon evaluation.
- **Interactive Review Interface:** Dedicated `/student/results/review/[attemptId]` route displays question-by-question student responses side-by-side with authoritative answer keys, explanation text, and marks awarded.

### 3. Test Assignments (Practice & Mock Engine)
- **Practice Mode Parity:** Runs inside the exact same high-performance exam engine as production assessments with identical rendering, palette, and autosave.
- **Repeatable Attempts:** Configurable `UNLIMITED` or `LIMITED` attempt policies with monotonic attempt numbering (`attempt_number >= 1`).
- **Flexible Access Modes:** `TESTER_ONLY` mode allows testers and admins to access all offered subjects without normal course enrollment; `ALL_ENROLLED` mode allows enrolled students to practice.
- **Early Exit & Submission:** Immediate early submission unlocking and a dedicated "Exit Test" modal calling atomic `exitTestExamAction`.
- **Result Isolation:** Practice attempts (`is_test = true`) are strictly excluded from official transcripts, profile completed counters, and administrative production analytics.

### 4. Faculty & Administrator Console
- **Hierarchical Paper Authoring:** Visual tree workspace for managing paper sets, sections, comprehension groups, and questions.
- **Unified Question Editor:** Single modal for authoring Multiple Choice (MCQ), Multiple Select (MSQ), and Numerical (NAT) questions with live LaTeX preview.
- **PDF Question Paper Import Assistant:** Local Node.js streaming parser that extracts legacy PDF examination papers into editable draft templates with granular verification flags (`Needs Review`).
- **Atomic Paper Publishing:** Deep-clones verified draft templates into an immutable version graph (`*_versions`), permanently freezing questions and answer keys before exam scheduling.
- **Assessment Event Management:** Schedule live exam windows, link published papers to subjects, configure test policies, and monitor student submissions.
- **Admin Question-Wise Results Grid:** Dedicated View B in `/admin/results/[examId]` dynamically generates question columns ($Q_1 \dots Q_N$) from the published paper version with sticky student identity, max marks, question types, and compact status badges (`✓`, `✕`, `—`, `⏳`, `⊘`, `?`).
- **Cross-Version Question Provenance:** Attempts taken on older paper versions map questions to canonical columns via unique `cloned_from_id` relationships, labeling unmapped questions as `Not in Paper` (`⊘`).
- **Scalable Query Architecture:** Bounded query execution with 50-attempt chunking and 1,000-row range pagination to prevent URL length overflow (HTTP 414) and PostgREST row limit truncation.
- **RFC 4180 CSV Export:** Exports the multi-subject student matrix or subject-specific results with appended dynamic question columns (`CORRECT`, `INCORRECT`, `UNANSWERED`, `PENDING`, `NOT_APPLICABLE`).

### 5. Student Feedback Centre
- **Dedicated Student Route (`/student/feedback`):** Structured form supporting 4 official categories: `feature_request`, `bug_report`, `question_correction`, and `general`.
- **Contextual Attachment:** Allows linking submissions directly to enrolled subjects, live assessments, specific question references, or route URLs.
- **My Submissions & Status Tracking:** Real-time student view tracking items through a 4-stage lifecycle: `new` ➔ `under_review` ➔ `in_progress` ➔ `closed`.
- **Mandatory Closure Outcomes:** Closing a submission strictly requires designating an outcome (`implemented` or `not_proceeding`) and provides an optional student-visible resolution note.
- **Protected Admin Triage Inbox (`/admin/feedback`):** Searchable, filterable administrative workspace with pagination, status badges, outcome pills, and count metrics.
- **Private Staff Internal Notes:** Administrators can record private operational notes on `student_feedback_internal_notes` with guaranteed zero leakage to students (enforced by database RLS and server action query boundaries).
- **Concurrency & Anti-Abuse Controls:** Backed by database advisory locks (`pg_advisory_xact_lock`) and atomic procedure `submit_student_feedback_v1`:
  - 60-second duplicate normalized title suppression.
  - Short-burst throttle: maximum 3 submissions per 2 minutes.
  - Hourly rate limit: maximum 10 submissions per user per hour.
- **Optional Direct Contact Email:** Configurable via `NEXT_PUBLIC_FEEDBACK_EMAIL`. When set, displays a direct mailto link; when unset or omitted, the UI gracefully renders standard in-portal ticketing guidance without broken links.

---

## Architecture & Technical Stack

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                             │
├────────────────────────────────────────────────────────────────────────┤
│ Client Layer:    Next.js 16 (React 19) • Tailwind CSS • Lucide Icons   │
│ Security Layer:  HMAC-SHA256 Session Cookies • Page Visibility API     │
│ Server Layer:    Server Actions • Route Handlers • Next.js Data Cache  │
│ Database Layer:  Supabase PostgreSQL • Row Level Security (RLS)        │
│ Storage Layer:   Private Supabase Storage Buckets (Signed CDN URLs)    │
│ Math Rendering:  KaTeX (Server-Side HTML Pre-Rendering)                │
└────────────────────────────────────────────────────────────────────────┘
```

- **Frontend & App Framework:** Next.js 16 (`16.3.8`, Turbopack, App Router, Server Components, Server Actions)
- **UI Library & Styling:** React 19 (`19.2.8`), Tailwind CSS 4 (`4.x`), Lucide Icons
- **Language & Type System:** TypeScript 5 (`5.x`)
- **Database & Auth:** Supabase PostgreSQL (17.x) with Row Level Security (RLS), Supabase Auth (`@supabase/supabase-js 2.117.2`, `@supabase/ssr 0.12.7`), `pg` driver (`8.23.1`)
- **Storage:** Private Supabase Storage bucket (`question_assets`, `pdf_imports`, `academic_resources`) delivering time-limited signed CDN URLs
- **Math Engine:** KaTeX (`0.19.0`) server-side pre-rendering with client-side fallback
- **Runtime:** Node.js 20+
- **Deployment:** Vercel automated continuous deployments triggered from `main`

---

## Security Model & Integrity Safeguards

- **Domain Restriction:** Authentication restricted to approved `@sst.scaler.com` email addresses; unauthorized logins are purged during OAuth callback.
- **Role-Based Access Control:** Distinct roles (`student`, `admin`, `tester`) enforced via PostgreSQL RLS and server middleware.
- **HMAC Exam Session Tokens:** Cryptographically binds `studentId`, `assessmentId`, and `attempts` in an HTTP-only SHA-256 HMAC session cookie, verified on all actions.
- **Admin Production Attempt Block:** Database trigger `prevent_admin_production_attempts` prevents administrators from inserting production attempts for themselves or on behalf of others.
- **Configuration Freeze Trigger:** `freeze_assessment_event_configuration` trigger locks all test parameters the moment an attempt commences.
- **Attempt Identity Freeze Trigger:** `freeze_attempt_identity` locks core attempt fields once created.
- **Answer Key Isolation:** Answer keys and evaluation tables reside exclusively in restricted server tables and are never exposed in student exam payloads.
- **Answer-Release Policy:** Production answers are accessible only after exam completion and explicit admin release (`release_answers = true`).
- **Private Asset Storage:** Raw storage bucket paths are private and accessible only via short-lived signed CDN URLs.
- **Anti-Cheating Telemetry:** Real-time tracking of fullscreen exits, window blur, tab switching, and copy/paste attempts, dispatched in batched cycles.

### Known Limitations & Operational Notes
1. **MSQ Answer-Key Completeness:** The database schema does not store the author's intended total count of correct MSQ options. The system enforces that at least two correct options exist for an MSQ, but cannot mathematically prove that additional intended options were not omitted during drafting.
2. **Historical Test Result Statuses:** Historical test result statuses were backfilled to `Evaluated` by migration 00039 without recalculating scores. Any student answers lost prior to saving were not retroactively recovered.
3. **Pending Live Browser Verifications:** Systematic manual browser testing following `docs/MANUAL_TESTING_CHECKLIST.md` remains to be executed against the live deployed environment.
4. **Development Dependency Advisory:** Known non-blocking advisory in devDependencies (`braces` <=3.0.3, GHSA-vfj7-8cjw-p6xm / CWE-674, affecting `micromatch` -> `fast-glob` -> `@next/eslint-plugin-next` -> `eslint-config-next`) affects development-time globbing only, not runtime request handling. Automatic remediation requires a breaking downgrade to Next.js 14.

---

## Performance Engineering (Phases 1–7)

The platform targets 250–300 concurrent candidates. The optimizations below reduce request volume and latency; production capacity still needs validation on infrastructure matching the deployed environment:

1. **Phase 1 — Auth Overhead:** Replaced database role queries with lightweight JWT claims (`getClaims()`) and consolidated service clients.
2. **Phase 2 — Perceived Speed:** Integrated React 19 Suspense streaming and skeleton loading states.
3. **Phase 3 — Login Callback:** Consolidated user provisioning into an atomic, idempotent RPC during OAuth callback.
4. **Phase 4 — Denormalized Max Marks:** Stored precomputed `max_marks` directly on the `results` table during finalization.
5. **Phase 5a — Atomic Save RPC:** Atomic `save_response` PostgreSQL function with client-side debounced save queue.
6. **Phase 5b — Reliability & Auto-Submit:** Single-transaction pending-answer save and finalization (`finalize_attempts_with_responses`), buffered telemetry, and non-blocking auto-submit retry loops.
7. **Phase 6 — Direct CDN Image Delivery:** Server-side batched signed URLs (3-hour lifetime) streaming directly from Supabase CDN; background preloading for the next 1–2 questions.
8. **Phase 7 — Client Weight & Paper Caching:**
   - Server-side KaTeX pre-rendering wrapped in `React.memo` to skip re-renders.
   - Code-split `ScientificCalculator` via `next/dynamic` deferred until opened.
   - On-demand loading of unselected subject papers (`loadUnselectedSubjectPaperAction`).
   - Next.js 16 `unstable_cache` persisting immutable paper structures across serverless cold starts.

*(Note: Performance Optimization Phases 1–7 are separate from Results System Phases 1–3.)*

---

## Local Development

### Web Analytics

Vercel Web Analytics is mounted once in `src/app/layout.tsx` using `@vercel/analytics/next` to collect page views and visitors. No custom events or database migrations are required. Local development uses the package's debug mode and does not send analytics data.

For deployment, enable **Analytics** in the Vercel project dashboard before deploying this change, then visit the production site and check the dashboard for incoming page views. Keep the owning team on Hobby for free analytics within its allowance; collection pauses at the usage limit instead of charging overages. Check [current limits and pricing](https://vercel.com/docs/analytics/limits-and-pricing) before changing plans.

To remove analytics or move hosting providers, remove the `Analytics` import and component from the root layout, run `npm uninstall @vercel/analytics`, disable Web Analytics in the Vercel dashboard, and redeploy. Student and exam data are independent of this integration.

### Prerequisites
- Node.js 20+
- npm or pnpm
- Supabase CLI

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/akshat-j1/q_platform.git
   cd q_platform
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file with safe placeholder values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   EXAM_SESSION_SECRET=your-hmac-sha256-secret-min-32-chars
   # Optional: Direct student feedback contact email
   NEXT_PUBLIC_FEEDBACK_EMAIL=feedback@your-domain.edu
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Verification Suite:**
   ```bash
   # Type check
   npx tsc --noEmit

   # Lint check
   npm run lint

   # Production build verification
   npm run build

   # Automated unit, component interaction, and logic tests
   npm test
   ```

---

## Documentation Index

For in-depth technical specifications, feature catalogs, and evolutionary context, refer to the documentation suite in `docs/`:

- [**`docs/PROJECT_SPEC.md`**](docs/PROJECT_SPEC.md): Authoritative technical specification, data models, lifecycle state machines, security triggers, Results System architecture, Student Feedback Centre schemas and RPCs, and caching models.
- [**`docs/FEATURES.md`**](docs/FEATURES.md): Human-readable catalog of all implemented features organized by domain, distinguishing verified features from manual checks and limitations.
- [**`docs/MANUAL_TESTING_CHECKLIST.md`**](docs/MANUAL_TESTING_CHECKLIST.md): Authoritative manual browser-testing protocol for release validation across student, administrator, and tester roles.
- [**`docs/PROJECT_HISTORY.md`**](docs/PROJECT_HISTORY.md): Chronological engineering history, major Git milestones, optimization phases, and design decisions.
