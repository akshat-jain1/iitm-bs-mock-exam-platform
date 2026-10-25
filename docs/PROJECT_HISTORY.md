# Project History & Architectural Evolution

This document traces the chronological evolution of the IITM BS Data Science Mock Examination Platform from its initial prototype through successive performance engineering phases, Test Assignments, and the 3-phase Results System.

This document records the original private development history. Commit hashes below refer to that original repository and are not present in this separate submission repository. They have not been independently reverified during this import.

---

## 1. Project Inception & Foundational Architecture

### Milestone 1: Core Setup & Schema Foundation (`a3414e6`)
- **Focus**: Initial repository setup, Next.js App Router bootstrap, Tailwind CSS integration, and foundational Supabase PostgreSQL schema.
- **Key Artifacts**:
  - `supabase/migrations/0001_initial_schema.sql`: Defined the core relational data model separating editable templates (`paper_sets`, `sections`, `questions`, `options`) from immutable versioned snapshots (`*_versions`).
  - Established student enrollment model and subject catalog.

### Milestone 2: Student Exam Interface Prototype (`12fec3c`)
- **Focus**: Building the distraction-free exam taking experience using local mock fixtures.
- **Key Features**:
  - Split-screen question palette and question viewing pane.
  - Interactive status tracking: Visited, Answered, Marked for Review.
  - Multi-subject navigation tabs.

### Milestone 3: Admin Workspace & Hydration Stability (`b0cf718`)
- **Focus**: Initial Admin Console and hierarchical question authoring workspace.
- **Fixes**: Resolved client/server hydration mismatches across math rendering and dynamic inputs.

---

## 2. Exam Execution, Evaluation & Dual-Role Security

### Milestone 4: Production Exam Lifecycle & Server Evaluation (`65ca835`, `b011657`)
- **Focus**: Replacing client-side mock evaluation with authoritative server-side execution.
- **Architecture**:
  - Server-enforced global exam duration formula: `Math.max(90, subjectCount * 60)` minutes.
  - Dynamic HMAC session cookie (`exam_session`) cryptographically binding student identity to active attempts.
  - Atomic assessment publishing routine deep-cloning draft templates into immutable version graphs.

### Milestone 5: Mathematical Fidelity & Formula Support (`a2010eb`)
- **Focus**: Real academic examination fidelity with complex mathematical notation.
- **Achievements**:
  - Integration of KaTeX math parser for inline and block equations.
  - July 16, 2023 mock examination test fixture imported with high fidelity.
  - Private Supabase Storage bucket (`question_assets`) for diagrams and visual figures.

### Milestone 6: Scaler Domain OAuth & Admin Access Control (`73ce01d`)
- **Focus**: Strict access boundaries.
- **Security Decisions**:
  - Enforced `@sst.scaler.com` email whitelist across login and API boundaries.
  - Separation of user privileges into `student` and `admin` roles backed by PostgreSQL Row Level Security (RLS).
  - Built administrative role assignment console.

### Milestone 7: Scientific Calculator & Exam Utilities (`e5094c9`)
- **Focus**: Parity with actual IITM examination centers.
- **Features**:
  - Built an in-exam floating scientific calculator beside the countdown timer.
  - Implemented full scientific functions: trigonometric (sin, cos, tan), logarithmic (ln, log10), exponents, and memory registers.

### Milestone 8: Results & Analytics Suite (`e025627`)
- **Focus**: Post-exam processing and faculty insights.
- **Features**:
  - Overall student performance matrix across multiple subjects.
  - Subject-level statistical analytics: mean, median, standard deviation, min/max scores.
  - RFC 4180 compliant CSV export for administrative records.

---

## 3. Student Portal & Exam Integrity Hardening

### Milestone 9: Student Portal v1.0 (`9c1b704`, `b17208b`)
- **Focus**: Complete student lifecycle outside of the active exam window.
- **Features**:
  - Student Dashboard (`/student`) displaying live, scheduled, and past assessments.
  - Student Profile (`/student/profile`) with self-service active subject enrollment (up to 8 subjects).
  - Dedicated Transcripts page (`/student/results`) and Learning Resources repository (`/student/resources`).

### Milestone 10: Anti-Cheating & Exam Integrity Suite (`bfbe8b7`, `aa2c878`)
- **Focus**: Exam security and cheating telemetry.
- **Implementations**:
  - Mandatory fullscreen exam entry with exit detection.
  - Tab visibility and window blur tracking via the HTML5 Page Visibility API.
  - Interception of copy, cut, and paste attempts inside the exam canvas.
  - Isolated active exam layout (`(exam)`) from standard portal navigation (`(portal)`).
  - Admin integrity inspection modal with timestamped audit trail (`00b563d`).

### Milestone 11: Production Hardening & Canonical Paper Importers (`3603900`, `0af908c`)
- **Focus**: Pre-deployment resilience and verified historical paper archives.
- **Implementations**:
  - Exponential backoff retry loop for autosave network interruptions.
  - Robust error handling for numerical answer submissions (`3c61d6a`).
  - Production importer for May 24 and July 16 canonical examination papers.
  - Dual-layer role resolution eliminating OAuth redirect loops (`d5e8fc9`).

---

## 4. The 7-Phase Performance Optimization Architecture

Between October 7 and October 8, 2026, the platform underwent seven systematic performance engineering phases toward a target of 250–300 concurrent exam candidates on serverless infrastructure. Later local testing found burst limits; this was not a production capacity guarantee.

### Phase 1: Auth Overhead Optimization (`6aaa292`)
- **Bottleneck**: Every server request performed a round-trip database query to verify user roles.
- **Solution**: Integrated lightweight Supabase JWT claim inspection (`getClaims()`) with automatic database fallback. Consolidated inline client instantiations into a shared server-only service client.

### Phase 2: Perceived Latency & Streaming Skeletons (`dc2586d`)
- **Bottleneck**: Route transitions felt sluggish due to synchronous data loading.
- **Solution**: Added React 19 Suspense boundaries and custom skeleton loading states across the student dashboard and assessment portals.

### Phase 3: Atomic OAuth Provisioning (`0c20dee`, `eba156f`)
- **Bottleneck**: Login callback executed multiple consecutive SQL queries to provision new users and check enrollments.
- **Solution**: Consolidated provisioning into a single atomic RPC (`handle_new_user_provisioning`) that validates domain rules and registers students in one database round-trip.

### Phase 4: Denormalized Maximum Marks (`946c417`)
- **Bottleneck**: Results aggregation dynamically summed question marks across the entire version hierarchy for every student view.
- **Solution**: Added `max_marks` column directly to the `results` table, populated once during exam finalization from immutable paper definitions.

### Phase 5a: Atomic Server-Side Save RPC (`b8187cd`, `62d0cf9`)
- **Bottleneck**: Direct table inserts for question answers competed under concurrency and lacked transactional integrity.
- **Solution**: Replaced client-driven mutations with the PostgreSQL stored function `save_response`, validating attempt ownership, live status, and question types in a single database step.

### Phase 5b: Reliability, Batching & Atomic Finalization (`eb01e5b`)
- **Bottleneck**: Autosave calls blocked UI interactions; individual integrity events caused request storms; multi-subject submissions could partially fail.
- **Solution**:
  - Introduced non-blocking debounced save queue (`useExamSaveQueue`) with exponential backoff.
  - Batched integrity telemetry into 15-second cycles with single-flight locking.
  - Created `finalize_attempts` RPC executing atomic evaluation, score calculation, and status updates within a single database transaction.

### Phase 6: Direct Storage Image Delivery (`46e2229`)
- **Bottleneck**: Every exam diagram was routed through `/api/assets/[...path]`, generating hundreds of simultaneous proxy round-trips to Supabase Storage.
- **Solution**: Exam launch pre-collects all image paths across the paper, deduplicates them, and executes a single batched `createSignedUrls` call (3-hour lifetime). Browsers stream images directly from the Supabase Storage CDN.

### Phase 7: Exam Client Weight & Paper Cache Optimization (`46e2229`)
- **Bottlenecks**: Client-side KaTeX rendering lagged during answer selection; initial bundle contained the 872-line calculator engine; multi-subject initial payloads were heavy.
- **Solutions**:
  1. **Server-Side Math Pre-Rendering**: LaTeX formulas pre-rendered to sanitized KaTeX HTML during paper caching; client `MathText` wrapped in `React.memo` to skip re-renders.
  2. **Lazy Calculator**: Dynamic import (`next/dynamic`) code-split the scientific calculator into a separate chunk loaded strictly on demand.
  3. **On-Demand Unselected Papers**: Full paper contents loaded only for selected subjects; unselected subjects load on-demand via `loadUnselectedSubjectPaperAction`.
  4. **Next.js 16 Paper Cache**: Wrapped paper generation in `unstable_cache` keyed by immutable `paper_set_version_id`, caching paper structures across serverless cold starts.

---

## 5. Test Assignments & Practice Mode Architecture (`5c24cce`)

### The Challenge
Production examinations are strictly one-attempt, formal windows with course enrollment requirements and fixed durations. Faculty and students required mock assessments ("Test Assignments") for practice without diluting production security, corrupting student transcripts, or building a parallel codebase.

### Architectural Decisions
1. **Unified Exam Engine**: Test assignments run through the exact same high-performance exam engine (Phases 1–7) rather than a separate prototype.
2. **Database Invariants & Enums**:
   - Extended `assessment_events` with `assignment_type` (`PRODUCTION` | `TEST`), `test_access_mode` (`TESTER_ONLY` | `ALL_ENROLLED`), `test_attempt_policy` (`UNLIMITED` | `LIMITED`), `test_max_attempts`, and `test_duration_mins`.
   - Table constraint `chk_assessment_events_assignment_rules` guarantees production events have null test fields and test events have valid positive durations.
3. **Concurrency-Safe Attempt Indexing**:
   - Replaced legacy table unique constraint on `(student_id, assessment_subject_id)` with partial unique indexes:
     - `idx_attempts_production_unique`: enforces 1 attempt on production (`WHERE is_test = false`).
     - `idx_attempts_test_unique`: allows repeated attempts on test assignments (`WHERE is_test = true`).
4. **Security Definer Exam Launch RPC (`start_student_attempts`)**:
   - Derives caller identity exclusively from `auth.uid()`.
   - Enforces Scaler email domain whitelist.
   - Enforces advisory locks (`pg_advisory_xact_lock`) to serialize concurrent exam launches.
   - Bypasses course enrollment for `TESTER_ONLY` mode when caller is `tester` or `admin`.
5. **Database Boundary Protection Triggers**:
   - `prevent_admin_production_attempts`: Blocks administrators from inserting production attempts for themselves or other students.
   - `verify_attempt_test_flag_consistency`: Guarantees `NEW.is_test = (parent_event.assignment_type = 'TEST')`.
   - `freeze_assessment_event_configuration`: Locks test configuration parameters permanently once the first attempt is created.
   - `freeze_attempt_identity`: Freezes attempt identity fields (`student_id`, `assessment_subject_id`, `paper_set_version_id`, `attempt_number`, `is_test`, `start_time`).
6. **Exam UX & Result Isolation**:
   - Immediate early submission enabled (`manualSubmitUnlockTimeMs = authoritativeStartTimeMs`).
   - "Exit Test" button with confirmation modal calling atomic `exitTestExamAction`.
   - Student transcripts, profile completed counters, and official admin statistics strictly exclude `is_test = true` records.

---

## 6. Post-Test Assignment Hardening & UI Standardization

Between October 8 and October 9, 2026, targeted stabilization commits hardened test assignment edge cases, database stored procedure search paths, and UI design consistency:

- **Milestone 12a — Role Management & Tester Administration (`0523c64`)**:
  - Implemented migration `20261009000035_fix_set_user_role_authorization.sql`.
  - Added atomic `set_user_role` stored procedure verifying admin permissions and preventing self-demotion.
  - Enhanced admin students console with direct role switching (`student`, `tester`, `admin`).
- **Milestone 12b — Test Exam Launch & Duration Repairs (`408f67f`)**:
  - Implemented migration `20261009000036_fix_start_student_attempts_search_path.sql` with explicit `search_path = ''`.
  - Enforced test duration overrides across combined exam timing computations.
- **Milestone 12c — Test Results & Reference Data Navigation (`4a3082b`)**:
  - Fixed test attempt filtering in admin results and student transcript pages.
  - Restored multi-section reference material modal navigation.
- **Milestone 12d — Session Consistency & Question Template Updates (`70d04c1`, `8867bd7`)**:
  - Implemented migration `20261009000037_enforce_active_session_consistency.sql`.
  - Implemented migration `20261009000038_save_question_template_rpc.sql` with conditional answer-mapping repair.
- **Milestone 12e — UI Color Standardization & Contrast (`ae14fb6`, `ae250b7`)**:
  - Replaced ad-hoc color classes with unified Tailwind slate/emerald/amber/rose palette.
  - Improved WCAG AA contrast compliance across question palette badges, buttons, and status indicators.
  - Configured editor CSS linting to ignore Tailwind v4 `@theme` and `@utility` at-rules.

---

## 7. The 3-Phase Results System Implementation

Between October 9 and October 10, 2026, the Results System was implemented across three strictly sequential phases, providing end-to-end evaluation integrity, student review capabilities, and administrative question-wise breakdown analytics.

### Results System Phase 1: Evaluation Status & Answer-Saving Integrity (`6dbedea`)
- **Core Challenge**: Some student test attempts remained indefinitely in `Pending Review` status due to incomplete answer keys, and race conditions during rapid exit or tab switching could leave answers in the client queue unsaved.
- **Implementation**:
  - Created migration `20261009000039_fix_evaluate_and_finalize_attempt_status.sql`.
  - Updated `evaluate_and_finalize_attempt` stored procedure to validate answer-key mapping counts:
    - MCQ: Exactly 1 row in `eval_mcq_msq_versions`.
    - MSQ: At least 2 rows in `eval_mcq_msq_versions`.
    - NUMERICAL: Valid row in `eval_numeric_versions` (`EXACT` or `RANGE`).
    - Questions with incomplete keys flag the result as `Pending Review` instead of falsely scoring 0.
  - Backfilled historical test result statuses to `Evaluated`.
  - Fixed save queue flush synchronization during test exit and subject switching in `useExamSession.ts`, `SubjectExamClient.tsx`, and `CombinedExamClient.tsx`.
- **Production Database Milestone**:
  - Migration 00039 was applied to the linked Supabase production project (`YOUR_SUPABASE_PROJECT_REF`) via `supabase db push`, bringing remote migration history to version 39 with zero pending migrations.

### Results System Phase 2: Student Exam History & Answer Review (`8f9b088`)
- **Core Challenge**: Students lacked a unified view of their exam history across attempts and had no mechanism to review questions, answers, and explanations.
- **Implementation**:
  - Extended `/student/results` with a dual-section interface:
    - **Official Results Tab**: Displays production assessment records with official GPA-relevant statistics.
    - **Exam History & Review Tab**: Lists all completed attempts from both Production and Test assignments, showing attempt numbers, scores, and review links.
  - Implemented strict server-side **Production Answer-Release Security**:
    - Server action `getAttemptReviewDataAction` enforces user authentication, attempt ownership, attempt completion, and result evaluation.
    - For `PRODUCTION` assessments: Answer keys and explanations are withheld unless the event status is `Completed` AND `release_answers = true`.
    - For `TEST` assignments: Answers and explanations are released immediately upon evaluation.
  - Built interactive review interface at `/student/results/review/[attemptId]`:
    - Question-by-question review displaying student response side-by-side with authoritative answer key, explanation text, and marks awarded.

### Results System Phase 3: Admin Question-Wise Results Table (`4884f98`)
- **Core Challenge**: Administrators could only view overall student totals, without visibility into question-level correctness across the paper.
- **Implementation**:
  - Built subject-specific View B in `/admin/results/[examId]` with dynamically generated question columns ($Q_1 \dots Q_N$).
  - Constructed question headers from the canonical published paper version, displaying question numbers, maximum marks, and question types.
  - Implemented cross-version question provenance via unique `question_versions.cloned_from_id` relationships. Unmapped questions safely display as `Not in Paper` (`⊘`).
  - Added compact status badges: `✓` (Correct), `✕` (Incorrect), `—` (Unanswered), `⏳` (Pending Review), `⊘` (Not in Paper), `?` (Unknown), with accessible legend and hover tooltips.
  - Scalable Query Architecture:
    - Chunked attempt IDs into batches of 50 (`ATTEMPT_BATCH_SIZE = 50`) to keep URL query strings under ~2.5 KB (preventing HTTP 414).
    - Implemented deterministic composite ordering (`.order("attempt_id").order("question_version_id")`) and 1,000-row range pagination (`.range(from, to)`) to prevent PostgREST row truncation.
    - Sequential batch execution to bound active concurrent requests to 1 at a time.
    - Checked all Supabase query errors; failures safely abort and return `null`, rendering an admin retry banner rather than misclassifying answers as `UNANSWERED`.
  - Extended RFC 4180 CSV Export: Appended ordered question columns with stable status strings (`CORRECT`, `INCORRECT`, `UNANSWERED`, `PENDING`, `NOT_APPLICABLE`) to subject CSV exports.


---

## 8. Platform Scheduling, Security Hardening & Student Feedback Centre Releases

Between October 10 and October 12, 2026, the platform underwent significant functional expansion and security hardening, culminating in the release of the Student Feedback Centre.

### Academic Timetable & Scheduling (`0f5097e`)
- **Core Need**: Students needed unified visibility into their upcoming IITM BS and Scaler class schedules directly within the dashboard.
- **Implementation**:
  - Migration `20261010000040_class_schedules.sql` created the `class_schedules` table with RLS, indexing, subject mapping, and recurrence metadata.
  - Student timetable view at `/student/classes` and administrative timetable management at `/admin/classes`.
  - Upgraded student dashboard with next-class notifications, timetable widgets, and quick-join links.

### Exam Integrity & UX Safeguards (`6282a74`, `b7d6f63`, `b871db2`, `217f91d`)
- **Implementation**:
  - Enforced fullscreen lockdown during active mock examinations with escape/tab switch detection and blur warning logs.
  - Automatic fullscreen release and clean teardown upon exam submission or natural timer expiry.
  - Handled edge cases around expired attempts, unsubmitted save queue flushing, and seamless question navigation.
  - Displayed authenticated user identity and role indicator in the administrative sidebar navigation.

### Privileged RPC Security Hardening (`bb4a56b`)
- **Core Challenge**: Default PostgreSQL function creation granted execute privileges to `PUBLIC` and `anon`, presenting potential vulnerability surface for sensitive RPCs.
- **Implementation**:
  - Migration `20261012000041_harden_rpc_permissions.sql` revoked default `PUBLIC` execution rights on sensitive database procedures.
  - Granted explicit `EXECUTE` privileges strictly to `authenticated` or `service_role` based on operational necessity.
  - Fixed search path resolution (`SET search_path = public, pg_temp`) across critical functions to eliminate search-path hijacking vectors.

### Asset Security & Paper Cache Stabilization (`1ea0c9c`, `fc4a7ea`, `3ef3fba`)
- **Implementation**:
  - Secured tester asset access and unified legacy paper evaluation paths.
  - Hardened upload pipelines for question images, resources, and question-bank ZIP/CSV import workflows.
  - Implemented in-memory paper caching bounded to 50 entries and 5-minute TTL with explicit write-through cache eviction on paper edit, publish, unpublish, and delete events.

### Student Feedback Centre Release (`d28ec08`)
- **Core Need**: Students required a structured in-app channel to submit feedback, report platform bugs, request exam features, and suggest question corrections, while staff needed a central triage workflow.
- **Implementation**:
  - Created migration `20261012000042_student_feedback_centre.sql` introducing:
    - `student_feedback`: Stores submission records across 4 categories (`FEATURE_REQUEST`, `BUG_REPORT`, `QUESTION_CORRECTION`, `GENERAL`) with submitter isolation and protected administrative fields (`status`, `resolution_outcome`, `resolution_note`).
    - `student_feedback_status_history`: Immutable audit trail tracking every lifecycle transition with changed-by user attribution and optional resolution explanations.
    - `student_feedback_internal_notes`: Dedicated table for private operational notes accessible strictly to administrators via table RLS policies.
  - Database-backed transactional RPC `submit_student_feedback_v1`:
    - Enforces fail-closed validation, automatic submitter attribution via `auth.uid()`, and `pg_advisory_xact_lock` serialisation.
    - Limits submissions to 10 per hour and 3 per 2 minutes per student, suppressing identical duplicate titles within a 60-second window.
    - Atomic insertion into both `student_feedback` and `student_feedback_status_history`.
  - Administrative RPC `update_feedback_status_v1`:
    - Role-restricted to admin/staff users.
    - Enforces state machine transitions: `NEW` → `UNDER_REVIEW` → `IN_PROGRESS` → `CLOSED`.
    - Requires closure resolution reasons (`IMPLEMENTED` or `NOT_PROCEEDING`) and resolution notes when transitioning to `CLOSED`.
    - Maintains private staff-only internal notes inaccessible to students in `student_feedback_internal_notes`.
  - Student portal interface at `/student/feedback` with real-time status tracking, and protected staff inbox at `/admin/feedback`.
  - Full fresh migration sequence (1–42) validated on local PostgreSQL, and migration 42 applied to production Supabase project `YOUR_SUPABASE_PROJECT_REF`.
  - Test suite expanded to 109 automated tests across 5 test suites.

---

## 9. Atomic submission and appearance (October 21, 2026)

- Reliability commit `b7e9eb7` replaced the three legacy Next.js page-param unions, removed redundant exam-start requests, added randomized save/submission retry timing, and retained unconfirmed answers for submission.
- Migration `20261021000043_atomic_finalization.sql` serializes saves with grading and adds service-only `finalize_attempts_with_responses`. Isolated integration checks verified invalid-answer rollback, saved final answers, and idempotent repeated submission. It is applied locally and on the linked Supabase project.
- A local synthetic test used 300 students and four subjects each. All concurrent exam-page loads and 3,600 paced saves succeeded. A same-instant finalization burst initially succeeded for 265/300 students; recovery completed all. Spreading submissions over three seconds succeeded for 300/300. The latest 1,200 subject attempts were verified completed with four answers each. This was an HTTP/RPC test, not 300 browser sessions or a hosted production capacity test.
- At the user's request, the temporary load-test app copy, scripts, fixture, schema audit dumps, and three isolated Docker volumes were removed. Shared Docker images, the ordinary local Supabase stack, application TEST assignments, and maintained regression tests were retained. No hosted load test was run.
- Appearance now supports light/dark mode across admin, student, authentication, review, and exam screens, using device preference initially and a browser-persisted override. Theme switching requires no database migration.
- Documentation now reflects 43 migrations, the actual 30-second save delivery window, and the distinction between local load-test evidence and production capacity.

## 10. Release verification

Check the active deployment commit in Vercel after pushing `main`; a successful Git push alone does not establish that production has deployed. Run [the short production checklist](PRODUCTION_CHECKLIST.md). Historical unit suite results above describe earlier releases; current release checks and any pending browser work should be reported separately.

## 2026-10-23 — Question and option image authoring

Added direct private-storage PNG/JPEG uploads, per-image width controls and proportional previews, descriptions, and shared sizing in the admin paper, student exam, and answer review. Upload processing caps large images at 1600px and avoids larger re-encoded originals. Normal cancellation and successful saves clean up unused uploads from the editor session. Existing signed CDN URLs, paper caches, preload behavior, immutable publishing, and atomic option saves are retained. No schema change: existing image_assets JSONB carries display_width and intrinsic dimensions. All 43 remote migration versions matched local files and the linked database dry run reported no pending migrations. See [authoring and validation details](FEATURES.md#question-authoring).


### 2026-10-23 — Authoring correction and migration 44

Reproduced the create-question failure on remote Supabase in a rollback-only transaction: `verify_content_node_membership` could not resolve unqualified `question_templates` under the atomic RPC's restricted search path. Migration 44 schema-qualifies all six template/version membership/evaluation triggers and allows image-only prompts/options. Applied the migration locally and remotely; the actual SQL creation/reorder/publish/immutability/permissions suite passed on both with fixtures rolled back.

Fixed previews rejected by the route's former `papers/`-only path guard: `authored/` now receives the same authorization checks, and immediate upload previews use temporary object URLs. Simplified questions and options to Text/Image controls, text by default, optional accompanying text, and an advanced-settings disclosure. Added interaction tests and a loopback-only HTTP integration script that verified uploaded/previewed bytes, auth guards, saving/reopening and signed CDN delivery with temporary fixtures cleaned up. Consolidated the authoring guide into the existing documentation instead of maintaining a separate image guide.
