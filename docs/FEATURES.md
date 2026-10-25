# Features Catalog: IITM Mock Exam Platform

This document serves as the comprehensive, authoritative catalog of all implemented features within the IITM BS Data Science Mock Examination Platform.

Every feature listed below is implemented in the codebase and backed by database schemas, triggers, server actions, and PostgreSQL stored procedures.

---

## 1. Platform & Authentication

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Light & Dark Appearance** | Implemented | Shared theme for admin, student, login, exam, calculator, and review screens; device preference on first visit, saved browser override, tab synchronization, and an accessible header toggle. No database writes. |
| **Google OAuth Integration** | Implemented & Verified | Seamless sign-in via Supabase Auth and Google OAuth with automatic session cookie management. |
| **Domain Whitelist Restriction** | Implemented & Verified | Strictly restricts login to authorized `@sst.scaler.com` email addresses. Non-conforming accounts are immediately rejected and purged. |
| **Role-Based Access Control (RBAC)** | Implemented & Verified | Three distinct roles supported: `student`, `admin`, and `tester`. Role enforcement is baked into PostgreSQL Row Level Security (RLS) and server middleware. |
| **Dual-Layer Role Resolution** | Implemented & Verified | Lightweight JWT claim extraction (`getClaims()`) with transparent database fallback (`public.get_auth_user_role()`) to eliminate redirect loops. |
| **Idempotent User Provisioning** | Implemented & Verified | Atomic OAuth callback RPC (`handle_new_user_provisioning`) that provisions student profile records without redundant database hops. |

---

## 2. Student Portal

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Student Dashboard** | Implemented & Verified | Central landing page displaying active enrolled subjects, upcoming/live examinations, and test assignments. |
| **Subject Enrollment Management** | Implemented & Verified | Student profile allows selecting up to 8 active course subjects from the IITM BS Data Science curriculum. |
| **Assessment Event Discovery** | Implemented & Verified | Automatically lists live and scheduled exams matching the student's enrolled subjects, showing scheduled start times and durations. |
| **Exam Instruction & Subject Selection** | Implemented & Verified | Pre-exam workflow where students review terms and select 1 to 4 eligible subjects to take concurrently in a single combined window. |
| **Official Results Transcripts** | Implemented & Verified | Dedicated Official Results section in `/student/results` showing scores, max marks, and percentages for official production assessments. |
| **Learning Resources** | Implemented & Verified | Dedicated `/student/resources` tab for downloading approved syllabus files, formula sheets, and study materials. |

---

## 3. Exam Engine & Test Experience

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Combined Multi-Subject Window** | Implemented & Verified | Students take up to 4 selected subjects within one continuous exam session with unified navigation, tabbed switching, and single final submission. |
| **Authoritative Server-Side Timing** | Implemented & Verified | Global exam duration is strictly calculated and enforced on the server (`Math.max(90, subjectCount * 60)` minutes for production). Client timer is display-only. |
| **Interactive Question Palette** | Implemented & Verified | Real-time question navigation grid tracking 4 states: Not Visited (gray), Not Answered (red), Answered (green), Marked for Review (yellow/purple). |
| **Server-Rendered KaTeX Math** | Implemented & Verified | Mathematical notation (`$...$`, `$$...$$`, LaTeX environments) is pre-rendered to HTML server-side with zero client-side KaTeX rendering overhead. |
| **Question/Option Image Authoring** | Implemented; component, HTTP, and database integration verified | Text by default; Text/Image controls, image-only content, optional accompanying text, working previews, and 40–1200px sizing. Migration 44 fixes authoring/publishing trigger search paths. See [Question authoring](#question-authoring). |
| **Direct CDN Image Delivery** | Implemented & Verified | Question and option images are delivered directly from Supabase Storage CDN via server-batched 3-hour signed URLs, bypassing application proxies. |
| **Targeted Background Image Preloading** | Implemented & Verified | Browser loads current question images with normal priority and silently preloads images for the next 1–2 questions in the background. |
| **On-Demand Subject Paper Loading** | Implemented & Verified | Initial payload only includes full paper details for selected subjects; unselected subjects load on-demand via secure Server Action (`loadUnselectedSubjectPaperAction`). |
| **Lazy Scientific Calculator** | Implemented & Verified | Full-featured floating scientific calculator (trigonometric, logarithmic, memory functions) code-split via `next/dynamic` and loaded only when opened. |
| **Distraction-Free Fullscreen Mode** | Implemented & Verified | Fullscreen exam interface with custom header containing timer, subject tabs, save queue indicator, and calculator toggle. |

---

## 4. Question & Paper Content Types

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Multiple Choice Questions (MCQ)** | Implemented & Verified | Single-correct option questions evaluated as full marks for exact match and 0 otherwise. |
| **Multiple Select Questions (MSQ)** | Implemented & Verified | Multi-correct option questions requiring exact-set matches; partial selections or extra options score 0. Evaluated strictly as binary scoring. |
| **Numerical Answer Questions (NAT)** | Implemented & Verified | Open numeric input evaluated server-side as either `EXACT` or within an inclusive `RANGE` (`min_val <= val <= max_val`). |
| **Comprehension Groups** | Implemented & Verified | Shared case study passages and scenario descriptions with multiple dependent questions. |
| **Section & Paper Reference Data** | Implemented & Verified | Support for reference tables, standard normal distributions, and formula sheets accessible per section. |
| **Immutable Version Graph** | Implemented & Verified | Deep-cloning publishing workflow that snapshots draft templates into immutable `*_versions` tables to preserve historical exam integrity. |
| **Next.js 16 Paper Cache** | Implemented & Verified | Two-tier caching: in-memory `BoundedLruCache` (capacity 100, TTL 1h, LRU eviction) plus Next.js Data Cache (`unstable_cache`) tagged per-paper and globally with immediate `{ expire: 0 }` invalidation semantics. |
| **Protected Asset Security** | Implemented & Verified | Route `/api/assets/[...path]` enforces role-based access, student Scaler email domain validation, tester test-only restriction, and strict `Cache-Control: private, no-store` headers. |

---

## 5. Autosave & Exam Reliability

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Non-Blocking Client Save Queue** | Implemented & Verified | Debounced background save queue (`useExamSaveQueue`) that coalesces rapid answer changes and prevents client UI blocking. |
| **Atomic Save RPC (`save_response`)** | Implemented & Verified | PostgreSQL stored procedure that validates student attempt ownership, live status, and question types in a single database transaction. |
| **Exponential Backoff & Retry** | Implemented & Verified | Save queue automatically retries transient network dropouts and server throttles (408, 429, 5xx) with exponential backoff and randomized retry delays. |
| **Header Save Status Indicator** | Implemented & Verified | Live visual status in exam header displaying "Saving...", "All changes saved", or "Unsaved - retrying...". |
| **Atomic Pending-Answer Submission** | Implemented & Integration Checked | `finalize_attempts_with_responses` saves the latest unconfirmed answers and grades all selected attempts in one transaction. Invalid answers roll back the submission; repeated requests safely skip completed attempts. |
| **Zero-Interruption Auto-Submit** | Implemented & Verified | After expiration, client spreads initial auto-submission over up to three seconds, then retries eligible failures up to 10 times with randomized delays. Unsaved answers are sent with finalization within the saving window. |
| **Grace Period Protection (`SAVE_GRACE_MS`)** | Implemented & Verified | 30-second server-side delivery window for saves and pending answers sent during finalization; production exams still reject early finalization. Finalization without new answers can complete after the save window. |

---

## 6. Exam Integrity & Anti-Cheating Telemetry

| Feature | Status | Description |
| :--- | :--- | :--- |
| **HMAC-Signed Exam Sessions** | Implemented & Verified | Cryptographically signs `student_id`, `assessment_id`, and `attempt_ids` in an HTTP-only SHA-256 HMAC cookie, verified on all exam actions. |
| **Fullscreen Exit Monitoring** | Implemented & Verified | Detects and logs when a student exits fullscreen mode during an active examination. |
| **Tab Switching & Visibility Loss** | Implemented & Verified | Tracks window blur, focus loss, and tab switching using the Page Visibility API. |
| **Copy / Paste Prevention & Tracking** | Implemented & Verified | Intercepts copy, cut, and paste attempts inside the exam interface and logs security telemetry events. |
| **Batched Telemetry Dispatch** | Implemented & Verified | Telemetry events are buffered client-side and dispatched in 15-second batches with single-flight protection to eliminate request storms. |
| **Admin Integrity Audit Modal** | Implemented & Verified | Administrative results matrix highlights integrity status with an audit modal displaying full event logs and timestamps. |

---

## 7. Results & Evaluation System

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Atomic Evaluation RPC (`evaluate_and_finalize_attempt`)** | Implemented & Verified | Server-side transaction that locks attempts, evaluates answers against immutable keys, writes to `results`, and marks attempts `Completed`. |
| **Answer-Key Completeness Guards** | Implemented & Verified | Guard in migration 00039 requiring exactly 1 key for MCQ, $\ge 2$ keys for MSQ, and valid rule for Numerical. Attempts with incomplete keys stay `Pending Review`. |
| **Precomputed Denormalized Max Marks** | Implemented & Verified | Stores total possible `max_marks` directly on the `results` table during finalization, eliminating recursive paper queries during result display. |
| **Student Exam History & Review Tab** | Implemented & Verified | Tab in `/student/results` listing all past attempts across both Production and Test assignments, showing attempts, scores, and review links. |
| **Production Answer-Release Policy** | Implemented & Verified | Server-gated answer release: Production exam answers and explanations are accessible only after assessment is `Completed` and `release_answers = true`. |
| **Interactive Student Attempt Review** | Implemented & Verified | `/student/results/review/[attemptId]` displays student responses side-by-side with correct answer keys, explanation text, and marks awarded. |
| **Admin Question-Wise Breakdown Table** | Implemented & Verified | View B in `/admin/results/[examId]` dynamically renders question columns ($Q_1 \dots Q_N$) from the published paper with compact status badges (`✓`, `✕`, `—`, `⏳`, `⊘`, `?`). |
| **Cross-Version Question Provenance** | Implemented & Verified | Unambiguous 1-to-1 matching via `question_versions.cloned_from_id` for attempts using earlier paper versions; unmapped questions display as `Not in Paper` (`⊘`). |
| **Response Query Scalability Batching** | Implemented & Verified | Splits attempt IDs into batches of 50 and retrieves responses with deterministic range pagination (1,000 rows/page) to prevent HTTP 414 and row truncation. |
| **Admin Overall Performance Matrix** | Implemented & Verified | Grid view showing student scores across all examination subjects with horizontal scrolling, search, and missing-result markers (`NA`). |
| **Subject-Specific Analytics** | Implemented & Verified | Calculates statistical metrics per subject: recorded submissions, average marks, average percentage, highest/lowest marks, median, and standard deviation. |
| **RFC 4180 CSV Export** | Implemented & Verified | One-click export of overall student performance matrix or detailed subject results with appended dynamic question columns and stable status strings. |

---

## 8. Test Assignments (Practice & Mock Engine)

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Dual Assignment Types** | Implemented & Verified | Assessment events are categorized at database and application levels as either `PRODUCTION` (official window) or `TEST` (practice/mock). |
| **Shared Core Exam Engine** | Implemented & Verified | Test assignments execute in the exact same high-performance exam engine with identical rendering, palette, calculator, and autosave. |
| **Custom Test Duration** | Implemented & Verified | Test assignments support arbitrary duration overrides (`test_duration_mins > 0`) rather than automatic subject-count formulas. |
| **Immediate Early Submission** | Implemented & Verified | Early submission lock is waived (`manualSubmitUnlockTimeMs = authoritativeStartTimeMs`), allowing testers to submit and review at any time. |
| **Explicit Exit & Finish Action** | Implemented & Verified | Top-bar "Exit Test" button triggers a confirmation modal calling atomic `exitTestExamAction` to finalize and return to the portal. |
| **Repeatable Attempt Policies** | Implemented & Verified | Supports `UNLIMITED` or `LIMITED` (`test_max_attempts > 0`) attempt policies with database-enforced attempt counters (`attempt_number >= 1`). |
| **Role-Based Access Gating** | Implemented & Verified | Supports `TESTER_ONLY` (testers/admins bypass course enrollment) and `ALL_ENROLLED` (students require active course enrollment). |
| **Admin Production Bypass Block** | Implemented & Verified | Database trigger `prevent_admin_production_attempts` prevents administrators from inserting production attempts for themselves or other users. |
| **Configuration Freeze Trigger** | Implemented & Verified | `freeze_assessment_event_configuration` trigger locks all test parameters the moment the first student attempt commences. |
| **Result Isolation** | Implemented & Verified | Test attempts (`is_test = true`) are strictly filtered from official student transcripts, profile attempt counts, and official admin statistics. |

---

## 9. Admin Console & Paper Authoring Workspace

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Hierarchical Paper Authoring** | Implemented & Verified | Visual tree editor for organizing paper set versions, sections, comprehension groups, and questions. |
| **Unified Question Editor** | Implemented & Verified | Single authoring modal for creating and updating MCQ, MSQ, and Numerical questions with live LaTeX preview. |
| **PDF Question Paper Import Assistant** | Implemented & Verified | Local streaming parser enforcing 20MB upload limits, `%PDF` magic header checks, and truthful rollback and failure reporting upon persistence errors. |
| **Publishing Pre-flight Validation** | Implemented & Verified | Validates section weights, option counts, answer keys, and verification status before deep-cloning draft papers into immutable version tables. |
| **Assessment Event Management** | Implemented & Verified | Admin interface for creating assessment windows, assigning subjects, selecting published paper versions, and configuring test policies. |
| **Student Directory & Enrolment Management** | Implemented & Verified | Admin tools for viewing student profiles and managing subject enrollments. |
| **Administrative Role Management** | Implemented & Verified | Admin console for assigning and managing `student`, `admin`, and `tester` roles with database validation. |

---

## 10. Academic Resources System

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Resource Repository** | Implemented & Verified | Structured repository for syllabus documents, formula sheets, and study materials with 20MB limit and file signature validation (`%PDF`, `PK\x03\x04`, text null-byte checks). |
| **Secure Download Delivery** | Implemented & Verified | Server-gated streaming download endpoint (`/api/resources/[resourceId]/download`) enforcing authentication, sanitized headers, unpublished-file checks, and caching headers (`private, max-age=3600` for published, `private, no-store` for errors). |
| **Admin Resource Manager** | Implemented & Verified | Interface for faculty to upload documents, assign metadata, set visibility, and track usage. |

---

## 11. Student Feedback Centre

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Feedback Submission Portal** | Implemented & Verified | Dedicated student route (`/student/feedback`) supporting 4 categories: `feature_request`, `bug_report`, `question_correction`, and `general` with character boundaries and category-specific guidance. |
| **Contextual Association** | Implemented & Verified | Enables students to link feedback directly to relevant academic subjects, live assessment events, question references, or application routes. |
| **My Submissions & Review Timeline** | Implemented & Verified | Student tracking dashboard showing submission statuses (`new`, `under_review`, `in_progress`, `closed`), closure outcomes (`implemented`, `not_proceeding`), resolution notes, and complete status audit histories. |
| **Atomic Submission & Rate Limiting** | Implemented & Verified | Backed by database advisory locks (`pg_advisory_xact_lock`) and atomic procedure `submit_student_feedback_v1`: 60s duplicate title suppression, short-burst throttle (3 per 2 mins), and hourly user limit (10 per hour), eliminating race conditions across serverless instances. |
| **Admin Feedback Triage Inbox** | Implemented & Verified | Administrative management interface (`/admin/feedback`) featuring server-side pagination, status/category filtering, parameterized search, and workflow count metrics. |
| **Atomic Status Transitions** | Implemented & Verified | Atomic transition procedure `update_feedback_status_v1` enforcing valid 4-state workflow, mandatory closure outcome selection (`implemented` or `not_proceeding`), student-visible messages, and audit logging. |
| **Private Staff Internal Notes** | Implemented & Verified | Isolated notes table (`student_feedback_internal_notes`) accessible strictly to administrators via RLS and server actions with zero student visibility. |
| **Optional Contact Email** | Implemented & Verified | Configurable direct contact email link via `NEXT_PUBLIC_FEEDBACK_EMAIL` environment key; cleanly omits the link and renders standard in-portal ticketing guidance when unset. |

---

## 12. Feature Verification & Known Limitations Matrix

### Verified Implementation Status
- **Core Platform & Auth:** Fully verified via unit tests, build pipeline, and database migrations.
- **Phases 1–5 Stabilization & Performance:** Code complete, verified across automated tests in test suites, compiled with Turbopack, and committed on `main`.
- **Class Schedules:** Fully verified via migration 40 (`20261010000040_class_schedules.sql`), admin management interface, and student schedule viewer.
- **Student Feedback Centre:** Fully verified via migration 42 (`20261012000042_student_feedback_centre.sql`), dedicated student and admin interfaces, advisory-lock concurrency controls, and comprehensive test suite (21 unit/logic tests + PostgreSQL integration suite).
- **Automated Test Coverage:** **124 automated tests passing across 7 test files** (`feedback-centre.test.ts`, `phase4-performance-and-caching.test.ts`, `phase3-import-and-resources.test.ts`, `fullscreen-enforcement.test.ts`, `legacy-attempt-and-tester-asset.test.ts`, `question-images.test.tsx`, `question-authoring.test.tsx`).
- **Database Migrations:** **All 44 migrations** verified active on remote Supabase project `YOUR_SUPABASE_PROJECT_REF` (including Migration 41 `20261012000041_harden_rpc_permissions.sql`, Migration 42 `20261012000042_student_feedback_centre.sql`, Migration 43 `20261021000043_atomic_finalization.sql`, and Migration 44 `20261023000044_fix_question_authoring.sql`).

### Features Awaiting Live Browser Verification
- **Appearance:** Check persistence, keyboard access, mobile headers, forms, tables, math, dialogs, calculator, and image readability in both themes using [the production checklist](PRODUCTION_CHECKLIST.md).
- **Hosted capacity:** Local synthetic results do not establish production capacity; the isolated load-test artifacts have been removed.
- **Test Exit with Unsaved Answer:** Verification in live browser that clicking "Exit Test" with an un-debounced answer flushes queue before finalization.
- **Subject Switching with Unsaved Answer:** Verification in live browser that switching subject tabs flushes save queue without race conditions.
- **Manual Release Validation:** Systematic verification across admin, student, and tester roles following `docs/MANUAL_TESTING_CHECKLIST.md`.

### Known Limitations & Operational Notes
1. **MSQ Answer-Key Total Count:** The database schema records which options are marked correct, but does not store an author-declared total count of intended correct options. The system safeguards that at least two correct options are stored, but cannot detect when an author intended three correct options and entered only two.
2. **Historical Test Scores Backfill:** Migration 00039 updated historical test result statuses to `Evaluated` without recalculating scores. Any student responses that were dropped prior to autosave fixes were not retroactively restored.
3. **Question Paper Invariance:** If an administrator schedules an assessment subject without configuring a published paper version (`paper_set_version_id`), question breakdown tables will not be generated and will safely display summary scores only.
4. **Database Default-Privilege Limitation:** Due to Supabase's managed Postgres role architecture, `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;` (applied in Migration 41) only governs routines created by `postgres`. Routines created under `supabase_admin` retain default schema privileges unless explicitly revoked. Application RPC security strictly enforces per-routine `REVOKE` statements and internal fail-closed role verification (`get_auth_user_role() = 'admin'`) rather than engine-level default privileges alone.
5. **Multi-Instance In-Memory Cache Limitation:** In-memory `BoundedLruCache` instances are scoped to each Node.js process. Local invalidation purges the calling worker's in-memory cache and emits Next.js `revalidateTag` instructions with `{ expire: 0 }`. In multi-instance deployments, other workers rely on TTL (1 hour) or capacity eviction if out-of-band updates are made under an *existing* version UUID. Ordinary publishing generates a new version UUID, which guarantees fresh cache-miss loading across all server instances.
6. **Development Dependency Advisory:** `npm audit` reports 1 advisory chain in devDependencies (`braces` <=3.0.3, GHSA-vfj7-8cjw-p6xm / CWE-674, via `micromatch` -> `fast-glob` -> `@next/eslint-plugin-next` -> `eslint-config-next`). Automatic remediation would require a breaking downgrade to Next.js 14 (`--force`). This advisory affects dev-time globbing only, not runtime request processing, and is preserved safely.


## Question authoring

In **Admin → Question Bank → open a paper → Add/Edit Question**, the question and every answer option start with a text field. Choose **Image** beside the question or an option to use a PNG/JPEG instead. Text is not required for image-only content. **+ Add text (optional)** lets you include text alongside an image; **Text** switches back to typing. Draft text/images are retained while switching modes in the open editor. Code snippets and verification status are under **More settings**.

Upload files up to 10 MB, with at most 12 images per question or option. The image appears immediately after upload. Adjust **Size (px)** with the slider or number input (40–1200px); height follows its aspect ratio. The preview uses the student rendering rules, including shrinking on narrow screens. The shown dimensions are intended CSS pixels, so screen width and browser zoom affect physical size. An optional image description is available under the image's description disclosure.

Save, then publish the paper using the existing workflow. Published versions retain their saved image content and sizes. Editing a draft affects newly published versions; removing an attachment does not remove assets referenced by historical papers.

### Storage and performance

Images use existing `image_assets` JSONB with `storage_path`, `display_width`, intrinsic `width`/`height`, optional `alt`, and preserved import metadata. Migration 44 does not add columns: it fixes schema qualification in six authoring/publishing triggers and changes the atomic save RPC to accept a prompt containing text or a valid image reference. Empty questions and empty options remain invalid.

Admin uploads are processed on demand: at most 40 megapixels, maximum edge 1600px, PNG transparency retained, JPEG quality 0.9, and original bytes retained when same-size re-encoding makes the file larger. Bitmaps and temporary preview URLs are released after use. Uploads use immutable paths and the existing private bucket's administrator write policy. Both `papers/` imports and `authored/` uploads are accepted by the protected preview route, with unchanged role/assessment authorization and path traversal checks. Immediate upload previews use a temporary object URL; reopened previews load authenticated image bytes from storage.

Changing display size updates metadata without another upload. Saving/changing options is disabled during an upload. Normal cancellation removes new uploads from that editor session; successful saves remove new uploads omitted from the saved question. Existing shared assets are retained. Abrupt tab closure or failed cleanup may leave an unused object; no automatic sweep deletes potentially shared published assets.

Student delivery keeps batched 3-hour signed CDN URLs, current/next-question loading, bounded LRU/Next.js paper caching, immutable paper versions, and the atomic option-save RPC. Sizing adds no student image requests or second image proxy. Each signed image retains its own size metadata when another image fails signing.

### Authoring verification

- `npm test` includes real component interactions for text defaults, mode switching, optional text, image upload previews, size editing, text/image-only submission, and useful validation errors, alongside existing regression suites.
- `supabase/tests/question_authoring.sql` tests real creation, option reconciliation/reordering, grouped MSQ, numerical answers, empty-content rejection, publishing, immutable sizes, and permissions. All fixtures and publications are rolled back. Run locally with `docker exec -i supabase_db_iitm_test_platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/question_authoring.sql`; run remotely with `supabase db query --linked -f supabase/tests/question_authoring.sql`.
- With local Supabase and the app at port 3001 running, `node --env-file=.env.local scripts/test_question_authoring_local.mjs` verifies authenticated uploads, actual preview image bytes for both folders, auth/path guards, image-only RPC creation, reopening, saved sizes, and signed CDN delivery. It refuses non-loopback services and cleans up its temporary account, draft paper, and files.
- Migration 44 and the SQL regression suite were applied/run successfully on both the local database and remote project `YOUR_SUPABASE_PROJECT_REF`. Local HTTP and component interaction tests passed. Full visual review on the hosted deployment remains a manual release check.
