# Project Specification: Online Examination Platform

- **Document Status:** Complete Architecture & Implementation Specification (including Stabilization Phases 1–5, Performance Optimization, Test Assignments, Results System, Class Schedules, and Student Feedback Centre).
- **Current source:** `main` includes atomic submission and browser-persisted dark mode. Verify the deployed commit in Vercel; Git synchronization alone does not prove deployment success.
- **Production Database Status:** Verified with all 44 migrations applied and 0 pending on linked Supabase project `YOUR_SUPABASE_PROJECT_REF`.
- **Source of Truth:** Master Project Technical Specification

---

## 1. Product Overview
The IITM BS Data Science Mock Examination Platform is a secure, high-performance web-based examination platform engineered for students, testers, and instructors of the IIT Madras BS in Data Science and Applications program.

The platform provides a focused, distraction-free environment for timed, multi-subject examinations. It supports full exam lifecycle operations: question paper authoring, legacy PDF extraction, student enrollment, multi-subject combined exam delivery, non-blocking background autosave, anti-cheating telemetry, automated server-side evaluation, comprehensive student exam history and review, administrative question-wise performance analytics, class scheduling, and a structured Student Feedback Centre.

---

## 2. Goals & Non-Goals

### Core Goals
- Deliver a robust academic examination platform supporting Multiple Choice (MCQ), Multiple Select (MSQ), and Numerical (NAT) questions.
- Enable faculty to author hierarchical question papers or import them from legacy PDF question papers with automated extraction and mandatory admin verification.
- Support multi-subject combined exam windows where students take 1 to 4 subjects concurrently under a single authoritative clock.
- Support complex LaTeX mathematical typography (pre-rendered server-side with KaTeX), code snippets, diagrams, comprehension case study passages, and section-level reference materials.
- Provide a non-blocking background autosave queue resilient to network interruptions and transient server throttles.
- Target 250–300 concurrent students; validate peak launch and submission capacity against the actual hosting configuration before making a capacity guarantee.
- Maintain strict historical exam integrity through an immutable version graph (`*_versions`).
- Provide distinct production examinations and repeatable practice Test Assignments with strict data and result isolation.
- Provide secure student exam history and question-level answer review gated by server-authoritative release policies.
- Provide granular administrative analytics including overall multi-subject matrices, subject-level statistics, dynamic question-wise breakdown grids, and RFC 4180 CSV exports.
- Provide a reliable, transactionally consistent Student Feedback Centre with database-backed rate limiting and private staff notes.

### Non-Goals / V1 Exclusions
- Audio or video question playback.
- Webcam streaming or automated AI video proctoring.
- Paid or heavyweight infrastructure dependencies (Kubernetes, microservices, Kafka, Redis, WebSockets).
- A separate mobile app that compromises the rigor of the desktop/laptop examination environment.
- Partial credit scoring on MSQ questions (the IITM grading model strictly uses exact-set binary scoring).
- Real-time WebSocket channels for student responses (the system uses durable, transactional HTTP stored procedures with client-side queuing).

---

## 3. Architecture & Technical Stack

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

- **Frontend & App Framework:** Next.js 16 (`16.3.8`, App Router, Server Components, Server Actions)
- **UI Library & Styling:** React 19 (`19.2.8`), Tailwind CSS 4 (`4.x`)
- **Database & Auth:** Supabase PostgreSQL with strict Row Level Security (RLS), Supabase Auth (`@supabase/supabase-js 2.117.2`, `@supabase/ssr 0.12.7`), `pg` driver (`8.23.1`)
- **Storage:** Private Supabase Storage bucket (`question_assets`, `pdf_imports`, `academic_resources`) delivering time-limited signed CDN URLs
- **Math Engine:** KaTeX (`0.19.0`) server-side pre-rendering with client-side fallback
- **Runtime:** Node.js 20+

### Route Structure
- `src/app/(admin)/admin/*`: Administrator and faculty console (exams, papers, results, question bank, resources, students, class schedule, feedback, settings).
- `src/app/(student)/student/(portal)/*`: Standard student portal layout with navigation (dashboard, profile, exams, results, resources, classes, feedback).
- `src/app/(student)/student/(exam)/*`: Isolated examination layout without portal navigation, headers, or distracting sidebars.
- `src/app/api/*`: Server-gated utility endpoints (asset streaming, telemetry dispatch, resource downloads).

---

## 4. Assessment Hierarchy & Immutable Version Graph

The platform uses a relational hierarchy separating editable drafting templates from immutable published versions:

```text
Assessment Event (Window)
    └── Assessment Subject
            └── Paper Set Version (Immutable)
                    └── Section Versions (Immutable)
                            ├── Comprehension Group Versions
                            │       └── Question Versions
                            │               ├── Option Versions
                            │               └── Eval Answer Keys
                            └── Direct Question Versions
                                    ├── Option Versions
                                    └── Eval Answer Keys
```

### 1. Template vs. Version Model
- **Editable Templates:** Faculty create draft papers, sections, groups, questions, and options in `paper_set_templates`, `section_templates`, `question_templates`, and `option_templates`.
- **Atomic Publishing:** The `publish_paper_set_template` stored procedure validates paper integrity and deep-clones the template tree into `paper_set_versions`, `section_versions`, `group_versions`, `question_versions`, and `option_versions`.
- **Frozen Identity:** Once published, question versions, text, options, and marks cannot be modified. Live examinations link exclusively to immutable version tables.

### 2. Answer-Key Representation
Answer keys are segregated into restricted evaluation tables:
- `eval_mcq_msq_versions`: Stores `(question_version_id, correct_option_version_id)`.
  - MCQ questions have exactly 1 mapping.
  - MSQ questions have $\ge 2$ mappings.
- `eval_numeric_versions`: Stores `(question_version_id, mode, exact_val, min_val, max_val)` where `mode` is `'EXACT'` or `'RANGE'`.

---

## 5. Student Enrollment & Subject Selection

- **User Roles:** Supported roles are `student`, `admin`, and `tester`.
- **Production Eligibility:** Based on the intersection of a student's active subject enrollments (up to 8 in student profile) and the subjects offered in the live Assessment Event.
- **Test Assignment Eligibility:**
  - `TESTER_ONLY`: Users with `tester` or `admin` role bypass course enrollment and can take any offered subject.
  - `ALL_ENROLLED`: Students and testers require active enrollment in the offered subject.
- **Pre-Exam Workflow:**
  1. Authenticate with `@sst.scaler.com` institutional Google account.
  2. Select 1 to 4 eligible subjects from the upcoming assessment card.
  3. Review exam terms, system requirements, and subject list.
  4. Launch combined exam: Server action invokes `start_student_attempts` RPC, creates attempt records, issues an HMAC-signed `exam_session` cookie, and redirects to `/student/assessment/[id]/exam`.

---

## 6. Combined Multi-Subject Exam Window & Authoritative Timing

- **Unified Window:** Selected subjects are presented in a single combined exam window with top-bar subject switching tabs, a shared countdown clock, a unified question palette, and a single final submission action.
- **Authoritative Server Timing:**
  - **Production Duration:** Computed strictly on the server as `Math.max(90, subjectCount * 60)` minutes (1 subject: 90m; 2 subjects: 120m; 3 subjects: 180m; 4 subjects: 240m).
  - **Test Duration:** Configured per event via `test_duration_mins > 0` regardless of subject count.
  - The client timer is purely for visual countdown display. The server rejects new answers after the duration plus the 30-second delivery grace. Finalization without new answers may complete later; production assessments reject early finalization.
- **Submission Timing:**
  - Production assessments lock manual submission until late in the exam window (`manualSubmitUnlockTimeMs`).
  - Test assignments unlock submission immediately (`manualSubmitUnlockTimeMs = authoritativeStartTimeMs`), enabling early submission and practice review.
  - Test assignments provide an explicit "Exit Test" header action with confirmation modal invoking atomic `exitTestExamAction`.
- **`SAVE_GRACE_MS` Semantics:** A 30-second delivery window applies to response saves and pending answers submitted atomically at finalization. It does not change the displayed exam duration or allow early production submission. Finalization without new answers can finish after the saving window.

---

## 7. Question Types, LaTeX Mathematics & Content Rendering

- **Multiple Choice Questions (MCQ):** Single option selection. Evaluated as full marks for exact match; 0 otherwise.
- **Multiple Select Questions (MSQ):** Multi-option selection. Evaluated as exact-set match: all correct options must be selected and zero incorrect options. Partial selections or extraneous options score 0.
- **Numerical Answer Questions (NAT):** Open numerical input. Evaluated as `EXACT` (`studentVal === exact_val`) or inclusive `RANGE` (`min_val <= studentVal <= max_val`).
- **LaTeX Math Pre-Rendering (KaTeX):** Mathematical expressions (`$...$`, `$$...$$`, LaTeX environments) are pre-rendered into sanitized HTML on the server during paper caching. Client renders KaTeX HTML in 0ms with `React.memo` skipping re-renders on untouched questions.
- **Direct CDN Image Delivery:** Exam figures stream directly from the Supabase Storage CDN via server-batched 3-hour signed URLs, bypassing application proxies.

---

## 8. Autosave State Machine, Save Queue & Reliability

- **Local Draft vs. Committed Response:** Selecting an option or editing an input updates local draft state immediately. Committing (via "Save & Next", palette navigation, or subject tab change) enqueues the response into the non-blocking client save queue.
- **Background Save Queue (`useExamSaveQueue`):**
  - Coalesces rapid keystrokes/clicks per question.
  - Asynchronously dispatches to the `save_response` RPC.
  - Exponential backoff with randomized delays on transient failures; the latest unconfirmed payload for each question is retained for atomic submission.
  - Live header indicator displays "Saving...", "All changes saved", or "Unsaved - retrying...".
- **Review State:** "Mark for Review" persists safely. Questions can be marked for review without an answer (Yellow) or with an answer (Purple).
- **Zero-Interruption Auto-Submit:** Auto-submits cleanly at expiration without blocking UI modals (`window.confirm` or `alert` are bypassed). Retries up to 10 times on transient clock skew codes.

---

- **Atomic finalization:** `finalize_attempts_with_responses` locks attempts in stable order, validates and writes pending responses using `save_response`, then grades all requested attempts in one transaction. Any invalid pending answer rolls back the transaction. Repeated completed submissions are idempotent.

## 9. Anti-Cheating & Exam Integrity Telemetry

- **HMAC-Signed Exam Sessions:** Signs `student_id`, `assessment_id`, and `attempt_ids` in an HTTP-only SHA-256 HMAC cookie, verified on all exam actions.
- **Fullscreen Exit Monitoring:** Detects and logs when a student exits fullscreen mode during an active examination.
- **Tab Switching & Visibility Loss:** Tracks window blur, focus loss, and tab switching using the Page Visibility API.
- **Copy / Paste Prevention & Tracking:** Intercepts copy, cut, and paste attempts inside the exam interface and logs security telemetry events.
- **Batched Telemetry Dispatch:** Telemetry events are buffered client-side and dispatched in 15-second batches with single-flight protection to eliminate request storms.
- **Admin Integrity Audit Modal:** Administrative results matrix highlights integrity status with an audit modal displaying full event logs and timestamps.

---

## 10. Evaluation & Result Finalization

Evaluation logic is exclusively server-side and entirely hidden from the client.

- **Atomic Finalization RPC (`evaluate_and_finalize_attempt` & `finalize_attempts`):**
  - Acquires row locks (`FOR UPDATE`) on target attempts.
  - Evaluates MCQ, MSQ, and Numerical answers against immutable `eval_*_versions`.
  - Calculates score and attaches denormalized `max_marks` derived from the immutable paper version.
  - Atomically marks attempts as `Completed` and writes to the `results` table in one transaction.
  - Skips already finalized attempts safely (idempotent).
- **Answer-Key Completeness Guards (Migration 00039):**
  - **MCQ:** Requires exactly 1 row in `eval_mcq_msq_versions`.
  - **MSQ:** Requires at least 2 rows in `eval_mcq_msq_versions`.
  - **NUMERICAL:** Requires the appropriate row in `eval_numeric_versions`.
  - If any answer key fails completeness checks, the result is flagged with `status = 'Pending Review'` to alert faculty, preventing false zero scores.

---

## 11. Security Model & Invariants

The platform enforces defense-in-depth across every layer:
- **Scaler Domain Restriction:** Only authenticated users with emails ending in `@sst.scaler.com` are permitted. Unauthorized logins are purged during OAuth callback.
- **Admin/Student/Tester Separation:** Enforced via `public.users.role` (`'student'`, `'admin'`, `'tester'`) with Row Level Security (RLS) on all database tables. All PL/pgSQL role checks use text casting (`::text`) to guarantee PostgreSQL enum transaction safety (error 55P04 prevention).
- **HMAC-Signed Exam Session Cookie:** Exam entry generates an HMAC-SHA256 signature binding `studentId`, `assessmentId`, `isTest`, and `attempts`. Verified on every asset access, autosave, paper request, and exit action.
- **Student/Attempt Binding:** Students can only read or write responses for attempts they own in `Live` status.
- **Answer Key Isolation:** Answer keys and `eval_*` tables are restricted to admin access and service-role execution; they are never exposed to the student client bundle or payload.
- **Service Role Isolation:** `SUPABASE_SERVICE_ROLE_KEY` is strictly server-only. Client components never import service clients or credentials.
- **Private Storage Assets:** Exam question visual assets reside in a private Supabase Storage bucket (`question_assets`). Raw bucket storage paths are never directly accessible or exposed as client URLs.
- **Shared Cache Security:** Shared caches (such as Next.js Data Cache for paper structures) store strictly immutable paper content and **never** store user identity, student responses, session tokens, or authorization decisions.
- **Database Boundary Triggers:**
  - `prevent_admin_production_attempts`: Rejects INSERT on `attempts` if event is `PRODUCTION` and either the caller role is `admin` or the target `student_id` is an admin.
  - `freeze_assessment_event_configuration`: `SECURITY DEFINER SET search_path = ''` trigger that freezes `assignment_type`, `test_access_mode`, `test_attempt_policy`, `test_max_attempts`, and `test_duration_mins` once any attempt commences.
  - `verify_attempt_test_flag_consistency`: Rejects attempts where `NEW.is_test != (parent_event.assignment_type = 'TEST')`.
  - `freeze_attempt_identity`: Prohibits updates to `student_id`, `assessment_subject_id`, `paper_set_version_id`, `attempt_number`, `is_test`, and `start_time`.
- **Concurrency-Safe Attempt Indexing:**
  - `idx_attempts_production_unique`: Unique on `(student_id, assessment_subject_id) WHERE is_test = false`.
  - `idx_attempts_test_unique`: Unique on `(student_id, assessment_subject_id, attempt_number) WHERE is_test = true`.

---

## 12. Performance Engineering (Phases 1–7)

The platform has completed 7 major performance engineering phases toward a target of 250–300 concurrent exam candidates; this is not a production capacity certification:

- **Phase 1 — Auth Overhead:** Replaced database role queries with lightweight JWT claims (`getClaims()`) and consolidated service clients.
- **Phase 2 — Perceived Speed:** Integrated React 19 Suspense streaming and skeleton loading states.
- **Phase 3 — Login Callback:** Consolidated user provisioning into an atomic, idempotent RPC during OAuth callback.
- **Phase 4 — Denormalized Max Marks:** Stored precomputed `max_marks` directly on the `results` table during finalization.
- **Phase 5a — Atomic Save RPC:** Atomic `save_response` PostgreSQL function with client-side debounced save queue.
- **Phase 5b — Reliability & Auto-Submit:** Single-transaction atomic finalization (`finalize_attempts`), buffered telemetry, and non-blocking auto-submit retry loops.
- **Phase 6 — Direct CDN Image Delivery:** Server-side batched signed URLs (3-hour lifetime) streaming directly from Supabase CDN; background preloading for the next 1–2 questions.
- **Phase 7 — Client Weight & Paper Caching:**
  - Server-side KaTeX pre-rendering wrapped in `React.memo` to skip re-renders.
  - Code-split `ScientificCalculator` via `next/dynamic` deferred until opened.
  - On-demand loading of unselected subject papers (`loadUnselectedSubjectPaperAction`).
  - Next.js 16 `unstable_cache` persisting immutable paper structures across serverless cold starts.

*(Note: Performance Optimization Phases 1–7 are separate from Results System Phases 1–3.)*

---

## 13. PDF Question Paper Import & Extraction Assistant

**Status:** IMPLEMENTED and AUTOMATED-TESTED.

- **Goal:** Production-grade, admin-only PDF Question Paper Import & Extraction Assistant. Allows administrators to upload a legacy examination PDF, deterministically extract questions, options, code blocks, and marks, store them as editable draft templates with verification flags, review them in the authoring workspace, and publish immutable snapshots.
- **Core Principle:** PDF extraction is strictly an **ASSISTANT**. Extracted content is **NEVER** automatically trusted or published. Mandatory admin verification is enforced at the database level prior to snapshot publishing.
- **Lifecycle:** `Uploaded` $\rightarrow$ `Extracting` $\rightarrow$ `Draft` $\rightarrow$ `Needs Review` $\rightarrow$ `Ready` $\rightarrow$ `Published`.
- **Extraction Engine:** Pure local Node.js streaming parser using standard library `zlib` (`inflateSync`) with zero external AI/API runtime dependencies. Answers are extracted only if explicitly provided in the PDF; questions without answer keys are tagged `Answer Needs Review`.

---

## 14. Test Assignments Architecture (Practice & Mock Mode)

**Status:** IMPLEMENTED, MIGRATED, and AUTOMATED-TESTED.

### Core Distinctions: PRODUCTION vs TEST

| Dimension | PRODUCTION Assessment | TEST Assignment |
| :--- | :--- | :--- |
| **Assignment Type** | `assignment_type = 'PRODUCTION'` | `assignment_type = 'TEST'` |
| **Duration** | `Math.max(90, subjectCount * 60)` mins | Custom override `test_duration_mins > 0` |
| **Attempt Limit** | Strictly 1 attempt per student/subject | `UNLIMITED` or `LIMITED` (`test_max_attempts > 0`) |
| **Attempt Number** | Always 1 | Increments monotonically (`attempt_number >= 1`) |
| **Access Gating** | Active course enrollment required | `TESTER_ONLY` (testers/admins bypass) or `ALL_ENROLLED` |
| **Early Submission** | Locked until late exam window | Unlocked immediately (`manualSubmitUnlockTimeMs = startTime`) |
| **Exit Action** | N/A | Dedicated "Exit Test" modal invoking `exitTestExamAction` |
| **Result Visibility** | Official transcripts & analytics | Excluded from official transcripts & counters |
| **Admin Participation** | Strictly denied | Permitted for testing and verification |

---

## 15. Results System Architecture (Phases 1–3)

The Results System extends the platform with end-to-end evaluation integrity, student review capabilities, and administrative question-wise breakdown analytics.

### Phase 1: Evaluation Status & Answer-Saving Integrity
- **Missing-Answer-Key Safeguards:** Updated `evaluate_and_finalize_attempt` RPC to validate answer-key mapping counts by question type:
  - MCQ: Exactly 1 row in `eval_mcq_msq_versions`.
  - MSQ: At least 2 rows in `eval_mcq_msq_versions`.
  - NUMERICAL: Valid row in `eval_numeric_versions` (`EXACT` or `RANGE`).
  - Unsupported or incomplete question versions flag the result as `Pending Review`.
- **Save Queue Synchronization:** Fixed client save queue flush sequencing on early exit and subject switching to prevent race conditions.

### Phase 2: Student Exam History & Answer Review
- **Dual-Section Student Results Portal:** `/student/results` displays:
  1. **Official Results:** Filtered strictly to production examinations (`is_test = false`).
  2. **Exam History & Review:** Displays all completed attempts across both Production and Test assignments, showing attempt numbers, scores, and review links.
- **Production Answer-Release Policy:** Production answers and explanations are confidential. Server action `getAttemptReviewDataAction` enforces:
  - User authentication and attempt ownership.
  - Attempt must be `Completed` or `Submitted`.
  - Result status must be `Evaluated`.
  - For `PRODUCTION` assessments: Parent event status must be `Completed` AND `release_answers = true`.
  - For `TEST` assignments: Released immediately upon evaluation.
- **Attempt Review Page:** Dedicated `/student/results/review/[attemptId]` presents question-by-question student responses side-by-side with correct answer keys, explanation text, and marks awarded.

### Phase 3: Admin Question-Wise Results Table
- **Subject Question Breakdown Grid:** Dedicated View B in `/admin/results/[examId]` dynamically generates question columns ($Q_1 \dots Q_N$) from the published paper version.
- **Cross-Version Question Provenance:** For attempts taken under earlier paper versions, questions map to canonical columns via unique `cloned_from_id` relationships. Unmapped questions safely display as `Not in Paper` (`⊘`).
- **Status Indicators:** Compact cells with accessible legend:
  - `CORRECT` (✓ green)
  - `INCORRECT` (✕ red)
  - `UNANSWERED` (— gray)
  - `PENDING` (⏳ amber)
  - `NOT_APPLICABLE` (⊘ gray)
  - `UNKNOWN` (? gray)
- **Scalable Query Batching & Pagination:**
  - `ATTEMPT_BATCH_SIZE = 50`: Splits attempt IDs into batches of 50 to keep URLs under ~2.5 KB (preventing HTTP 414).
  - `RESPONSE_PAGE_SIZE = 1000`: Retrieves responses using deterministic composite ordering (`.order("attempt_id").order("question_version_id")`) and range pagination (`.range(from, to)`).
  - Bounded concurrency: Batches are processed sequentially, bounding active queries to 1 at a time.
  - Error Safety: All Supabase query errors abort and return `null`, never misclassifying answers as `UNANSWERED`.
- **Extended RFC 4180 CSV Export:** Appends ordered question columns with stable status strings to the subject CSV export.

---

## 16. Student Feedback Centre Architecture

The Student Feedback Centre provides a production-grade, transactionally consistent feedback and issue reporting system built directly on Supabase PostgreSQL.

### 1. Relational Data Model
- **`student_feedback`:** Core feedback records.
  - `id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4()`
  - `user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
  - `category TEXT NOT NULL CHECK (char_length(category) <= 50)` — Valid categories: `feature_request`, `bug_report`, `question_correction`, `general`.
  - `title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3 AND char_length(title) <= 200)`
  - `description TEXT NOT NULL CHECK (char_length(trim(description)) >= 10 AND char_length(description) <= 5000)`
  - `status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'in_progress', 'closed'))`
  - `resolution_outcome TEXT CHECK (resolution_outcome IS NULL OR resolution_outcome IN ('implemented', 'not_proceeding'))`
  - `resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000)`
  - `subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL`
  - `assessment_event_id UUID REFERENCES public.assessment_events(id) ON DELETE SET NULL`
  - `question_reference TEXT CHECK (question_reference IS NULL OR char_length(question_reference) <= 100)`
  - `page_url TEXT CHECK (page_url IS NULL OR char_length(page_url) <= 500)`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - **Check Constraint:** `CHECK ((status = 'closed' AND resolution_outcome IS NOT NULL) OR (status != 'closed' AND resolution_outcome IS NULL))`
- **`student_feedback_status_history`:** Immutable audit log tracking all status transitions.
  - `id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4()`
  - `feedback_id UUID NOT NULL REFERENCES public.student_feedback(id) ON DELETE CASCADE`
  - `actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL`
  - `old_status TEXT CHECK (old_status IS NULL OR old_status IN ('new', 'under_review', 'in_progress', 'closed'))`
  - `new_status TEXT NOT NULL CHECK (new_status IN ('new', 'under_review', 'in_progress', 'closed'))`
  - `new_outcome TEXT CHECK (new_outcome IS NULL OR new_outcome IN ('implemented', 'not_proceeding'))`
  - `message TEXT CHECK (message IS NULL OR char_length(message) <= 2000)`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **`student_feedback_internal_notes`:** Private operational and administrative notes.
  - `id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4()`
  - `feedback_id UUID NOT NULL REFERENCES public.student_feedback(id) ON DELETE CASCADE`
  - `author_id UUID REFERENCES public.users(id) ON DELETE SET NULL`
  - `note TEXT NOT NULL CHECK (char_length(trim(note)) > 0 AND char_length(note) <= 4000)`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### 2. Transactional Stored Procedures
- **`submit_student_feedback_v1`:**
  - `SECURITY DEFINER SET search_path = pg_catalog, pg_temp`
  - Public execution revoked; granted to `authenticated` and `service_role`.
  - Serializes concurrent requests per user via `pg_advisory_xact_lock(hashtext(v_caller_id::text))` to eliminate race conditions across serverless instances.
  - Enforces submitter identity invariance: For non-service-role callers, `v_caller_id` is strictly bound to `auth.uid()`, discarding client-supplied IDs.
  - Enforces duplicate normalized title suppression within a 60-second window.
  - Enforces rate limits: Maximum 3 submissions per 2 minutes (burst), maximum 10 submissions per hour.
  - Atomically creates the `student_feedback` record and its initial `student_feedback_status_history` record (`old_status = NULL`, `new_status = 'new'`).
- **`update_feedback_status_v1`:**
  - `SECURITY DEFINER SET search_path = pg_catalog, pg_temp`
  - Public execution revoked; granted to `authenticated` and `service_role`.
  - Caller authorization: Requires `public.get_auth_user_role() = 'admin'` for authenticated non-service callers.
  - Validates 4-state workflow transitions and enforces that transitioning to `closed` must supply a valid outcome (`implemented` or `not_proceeding`).
  - Atomically updates the feedback row, inserts an audit record in `student_feedback_status_history`, and optionally records an operational note in `student_feedback_internal_notes`.

### 3. Row Level Security & Isolation Guarantees
- **`student_feedback`:**
  - `Users read own feedback or admin reads all`: `USING (user_id = auth.uid() OR public.get_auth_user_role() = 'admin')`
  - `Users insert own feedback`: `WITH CHECK (user_id = auth.uid())`
  - `Admins update feedback` / `Admins delete feedback`: Restricted to `public.get_auth_user_role() = 'admin'`. Students cannot directly UPDATE workflow fields.
- **`student_feedback_status_history`:**
  - `Users read history of own feedback or admin reads all`: Students see status changes and student messages for their own feedback; admins view all.
  - Direct modifications locked: Only admins can insert records directly (`public.get_auth_user_role() = 'admin'`).
- **`student_feedback_internal_notes`:**
  - `Admins manage internal notes`: Restricted strictly to `public.get_auth_user_role() = 'admin'`. Students have **zero** read/write access at the database level.

---

## 17. Database Schema & Migration History

All database changes are tracked sequentially in `supabase/migrations/`:

| Migration | Identifier / Description |
| :--- | :--- |
| `0001` | `20260926231014_0001_initial_schema.sql`: Core schema, constraints, templates, and version graph. |
| `0002` | `20260927000000_0002_rls_auth.sql`: Auth sync triggers, roles, and Row Level Security. |
| `0003` | `20260927000003_remove_event_duration.sql`: Dynamic timing refactor. |
| `0004` | `20260927000004_review_state.sql`: Add `marked_for_review` and DELETE policies. |
| `0005` | `20260927000005_evaluation_rpc.sql`: Atomic evaluation and finalization RPC. |
| `0006` | `20260928000006_paper_publishing.sql`: Unique paper set identity constraint and atomic publishing RPC. |
| `0007` | `20260928000007_pdf_import.sql`: PDF import job schema and verification flags. |
| `0008` | `20260928000008_question_assets_storage.sql`: Storage bucket configuration and policies. |
| `0009` | `20260928000009_option_image_assets.sql`: Option-level visual asset storage. |
| `0010` | `20260928000010_allow_zero_marks_questions.sql`: Zero-mark diagnostic questions. |
| `0011` | `20261003000011_fix_group_questions_rls.sql`: Fix comprehension group question RLS. |
| `0012` | `20261005000012_scaler_google_auth.sql`: Scaler OAuth provisioning and domain restrictions. |
| `0013` | `20261005000013_admin_role_management.sql`: Admin role assignment procedures. |
| `0014` | `20261006000014_results_demo_cleanup_rpc.sql`: Demo test attempt cleanup utilities. |
| `0015` | `20261006000015_resources_schema.sql`: Academic learning resources tables and policies. |
| `0016` | `20261006000016_student_subjects_selection.sql`: Active subject enrollment model (max 8). |
| `0017` | `20261006000017_exam_integrity_events.sql`: Anti-cheating telemetry tracking tables. |
| `0018` | `20261007000018_security_hardening.sql`: Role enum casting and PL/pgSQL transaction safety. |
| `0019` | `20261007000019_seed_foundation_subjects.sql`: Seed official IITM foundation courses. |
| `0020` | `20261007000020_resilient_user_role_lookup.sql`: Resilient role resolution RPC. |
| `0021` | `20261007000021_grant_public_table_privileges.sql`: Grant public schema privileges. |
| `0022` | `20261007000022_performance_indexes.sql`: Composite performance indexes for query optimization. |
| `0023` | `20261007000023_cleanup_old_practice_papers_rpc.sql`: Practice paper cleanup RPC. |
| `0024` | `20261007000024_fix_cleanup_old_practice_papers_rpc.sql`: Fix cleanup parameter types. |
| `0025` | `20261007000025_update_cleanup_rpc.sql`: Update cleanup logic. |
| `0026` | `20261007000026_specific_trigger_cleanup_rpc.sql`: Specific trigger cleanup routine. |
| `0027` | `20261008000027_custom_access_token_hook.sql`: Custom JWT claim hook for instant roles. |
| `0028` | `20261008000028_provision_user_on_login.sql`: Atomic idempotent user provisioning RPC. |
| `0029` | `20261008000029_remove_auto_subject_enrollment.sql`: Require explicit student subject enrollment. |
| `0030` | `20261008000030_store_max_marks_on_results.sql`: Denormalize `max_marks` on `results`. |
| `0031` | `20261008000031_save_response_rpc.sql`: Atomic `save_response` PostgreSQL function. |
| `0032` | `20261008000032_fix_save_response_and_triggers.sql`: Refine response validation and triggers. |
| `0033` | `20261008000033_finalize_attempts_rpc.sql`: Atomic multi-subject finalization RPC. |
| `0034` | `20261009000034_test_assignments.sql`: Complete Test Assignments feature and triggers. |
| `0035` | `20261009000035_fix_set_user_role_authorization.sql`: Strengthen admin role assignment checks. |
| `0036` | `20261009000036_fix_start_student_attempts_search_path.sql`: Fix search path in launch RPC. |
| `0037` | `20261009000037_enforce_active_session_consistency.sql`: Enforce session consistency rules. |
| `0038` | `20261009000038_save_question_template_rpc.sql`: Atomic question template update RPC. |
| `0039` | `20261009000039_fix_evaluate_and_finalize_attempt_status.sql`: Correlated answer-key completeness validation and backfill. |
| `0040` | `20261010000040_class_schedules.sql`: Add `class_schedules` table, indexes, check constraint, and RLS policies. |
| `0041` | `20261012000041_harden_rpc_permissions.sql`: Harden Database RPC Permissions and Revert Over-Permissive Default Routine Grants. |
| `0042` | `20261012000042_student_feedback_centre.sql`: Student Feedback Centre schema, audit history, private staff notes, advisory-lock concurrency controls, and RLS policies (Applied to production `YOUR_SUPABASE_PROJECT_REF`). |
| `0043` | `20261021000043_atomic_finalization.sql`: Serialize response writes with grading and atomically save pending answers before finalization; service-role execution only. |

**Production Status:** Production Supabase project `YOUR_SUPABASE_PROJECT_REF` is verified with all 44 migrations applied and zero pending migrations.

---

## 18. Security Conventions & Known Limitations

### Security Conventions
- Service-role credentials (`SUPABASE_SERVICE_ROLE_KEY`) are server-only and never bundled into client code.
- Privileged RPC execution is strictly enforced based on least-privilege principles:
  - `evaluate_and_finalize_attempt`, `delete_results_demo_paper_versions`, and `check_exam_asset_access` have execute privileges revoked from `PUBLIC`, `anon`, and `authenticated`, granting access exclusively to `service_role`.
  - Trigger procedures such as `enforce_student_attempt_restrictions` have execute privileges revoked from `PUBLIC`, `anon`, and `authenticated`.
  - Authoring & validation RPCs `publish_paper_set_template` and `validate_paper_for_publishing` revoke execute from `PUBLIC` and `anon`, granting to `authenticated` and `service_role`, with internal fail-closed role verification (`auth.uid() IS NULL` or `get_auth_user_role()::text IS DISTINCT FROM 'admin'` raises an exception).
  - Feedback procedures `submit_student_feedback_v1` and `update_feedback_status_v1` revoke execute from `PUBLIC`, granting to `authenticated` and `service_role`. `update_feedback_status_v1` strictly requires `get_auth_user_role() = 'admin'`, while `submit_student_feedback_v1` overrides client-supplied user parameters with `auth.uid()`.
- Answer keys and evaluation tables are never sent in student examination bundles.
- Stored procedures enforce hardened search paths with explicit schema qualification rather than relying on ambient configuration:
  - `publish_paper_set_template`, `validate_paper_for_publishing`, `submit_student_feedback_v1`, and `update_feedback_status_v1` enforce `SECURITY DEFINER SET search_path = pg_catalog, pg_temp` with explicit `public.` table qualifications.
  - Runtime exam execution procedures (`start_student_attempts`, `evaluate_and_finalize_attempt`, `save_response`, `save_question_template`) and integrity triggers (`freeze_assessment_event_configuration`) enforce `SECURITY DEFINER SET search_path = ''` with fully qualified identifiers.
  - Legacy helper utilities (`get_auth_user_role`) specify `SECURITY DEFINER SET search_path = public`.
- Routine default privileges in schema `public` for role `postgres` have been altered to revoke all routine execution from `anon` and `authenticated` (`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;` via Migration 41).
- Session tokens are signed using SHA-256 HMAC and stored in HTTP-only, SameSite cookies.
- Protected exam assets and error responses enforce `Cache-Control: private, no-store`.

### Known Limitations & Operational Notes
1. **MSQ Answer-Key Total Count:** The database schema records which options are marked correct, but does not store an author-declared total count of intended correct options. The system safeguards that at least two correct options are stored, but cannot detect when an author intended three correct options and entered only two.
2. **Historical Test Scores Backfill:** Migration 00039 updated historical test result statuses to `Evaluated` without recalculating scores. Any student responses that were dropped prior to autosave fixes were not retroactively restored.
3. **Question Paper Invariance:** If an administrator schedules an assessment subject without configuring a published paper version (`paper_set_version_id`), question breakdown tables will not be generated and will safely display summary scores only.
4. **Database Default-Privilege Limitation:** Due to Supabase's managed Postgres role architecture, `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;` (applied in Migration 41) only governs routines created by `postgres`. Objects or routines created under `supabase_admin` retain Supabase engine default schema privileges unless explicitly altered for that specific role. Consequently, application security relies on explicit per-function `REVOKE` statements and internal fail-closed identity guards (`get_auth_user_role() = 'admin'`, `role IS DISTINCT FROM 'admin'`) rather than engine-level default privileges alone.
5. **Multi-Instance In-Memory Cache Limitation:** In-memory `BoundedLruCache` instances are scoped to each Node.js process. Local invalidation purges the calling worker's in-memory cache and emits Next.js `revalidateTag` instructions with `{ expire: 0 }`. In multi-instance deployments, other workers rely on TTL (1 hour) or capacity eviction if out-of-band updates are made under an *existing* version UUID. Ordinary publishing generates a new version UUID, which guarantees fresh cache-miss loading across all server instances.
6. **Development Dependency Advisory:** `npm audit` reports 1 advisory chain in devDependencies (`braces` <=3.0.3, GHSA-vfj7-8cjw-p6xm / CWE-674, via `micromatch` -> `fast-glob` -> `@next/eslint-plugin-next` -> `eslint-config-next`). Automatic remediation would require a breaking downgrade to Next.js 14 (`--force`). This advisory affects dev-time globbing only, not runtime request processing, and is preserved safely.
7. **Pending Live Browser Verifications:** Browser testing across student, tester, and admin roles will follow Phase 5 review using the manual browser checklist.

---

## 18. Development Setup & Operational Workflows

### Environment Configuration
Configure `.env.local` with safe placeholders:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
EXAM_SESSION_SECRET=your-hmac-sha256-secret-min-32-chars
```

### Verification Pipeline
```bash
# Type check across all routes and components
npx tsc --noEmit

# ESLint validation
npm run lint

# Next.js production build verification
npm run build
```

### Database Migration Workflow
1. Create new migration: `supabase migration new <name>`
2. Apply locally: `supabase migration up`
3. Check linked status: `supabase migration list --linked`
4. Dry-run push to remote: `supabase db push --dry-run`
5. Apply to remote: `supabase db push`

### Deployment Workflow
Pushes to GitHub `main` trigger automated Vercel deployments. Always verify `npx tsc --noEmit` and `npm run build` locally prior to pushing.

## Appearance preferences

The root layout initializes `data-theme` before first paint, using the saved `iitm-theme` browser preference or the device color scheme. `ThemeProvider` follows system changes until an explicit light/dark override is saved and synchronizes changes across tabs. Storage failures fall back to a working session-only preference. Header buttons are keyboard accessible and expose their pressed state. Theme changes only affect presentation and do not write to Supabase. All exam surfaces share the theme; original academic image canvases and code syntax colors are preserved.

The admin and student interfaces use explicit Tailwind dark variants for surfaces, text, focus states, alerts, controls, and tables. Add both theme variants when introducing fixed color utilities. Follow [Production checklist](PRODUCTION_CHECKLIST.md) for release verification.

## Question image sizing

Question and option `image_assets` JSONB can carry `display_width` (40–1200 CSS pixels), intrinsic `width`/`height`, and `alt` alongside existing storage/import metadata. Admin authoring, student exams, and answer review share responsive image rendering. Publishing copies this metadata into immutable versions using the existing publishing RPC. Text is the default; selecting Image allows image-only content with optional text. The atomic save RPC rejects content lacking both text and a valid image reference. Migration 44 schema-qualifies the six integrity triggers used by saving and publishing, preserving restricted RPC search paths. Both imported `papers/` and uploaded `authored/` images are supported by the protected preview route. See [Question authoring](FEATURES.md#question-authoring) for the upload pipeline, limits, and release checks.
