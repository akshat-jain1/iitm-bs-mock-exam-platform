# Manual Browser-Testing Checklist & Release Validation Protocol

- **Current source:** `main` includes atomic pending-answer submission and shared dark mode. Confirm the active deployment commit before beginning production checks.
- **Database Status:** Verified with all 44 migrations applied (through `20261023000044_fix_question_authoring.sql`) on linked Supabase project `YOUR_SUPABASE_PROJECT_REF`.
- **Verification record:** Historical unit/database checks are recorded in PROJECT_HISTORY.md. The current release runs lint, TypeScript, production build, and theme preference checks; authenticated browser verification remains manual.
- **Scope:** Authoritative manual browser-testing protocol for release validation of the IITM BS Data Science Mock Examination Platform across student, administrator, tester, and unauthenticated sessions.

Start with [the production checklist](PRODUCTION_CHECKLIST.md), which uses existing records and read-only navigation. Sections below that publish papers, submit feedback, upload files, change configuration, or start attempts create or modify records; run those only in a dedicated test environment or an explicitly designated TEST assignment. No load test should target production without a separate approved plan.

---

## Testing Environment & Pre-requisites

### Required Test Accounts
1. **Admin Account:** Verified Google OAuth account with role `admin` (e.g. `admin@sst.scaler.com`).
2. **Student Account A:** Verified Google OAuth account with role `student` and active course enrollments (e.g. `student1@sst.scaler.com`).
3. **Student Account B (Secondary):** Distinct student account to test multi-student isolation and cross-account access attempts.
4. **Tester Account:** Verified Google OAuth account with role `tester` (e.g. `tester@sst.scaler.com`).
5. **Unauthorized Account:** Google OAuth account outside the `@sst.scaler.com` domain (e.g. personal `@gmail.com` account) for domain-restriction testing.

### Clean Browser Setup
- Use Chrome or Edge (latest stable release) on macOS or Windows.
- Keep DevTools (Console and Network tabs) open during testing to observe network headers, cache responses, and telemetry dispatches.
- Do not run ad-blockers or aggressive tracking blockers that suppress session cookies or fetch requests.

---

## 1. Login, Logout, and Role-Based Access

### Test 1.1: Scaler Google OAuth Sign-in & Domain Verification
- **Role Required:** Student / Admin / Tester
- **Setup:** Open browser in incognito mode. Navigate to `/login`.
- **Action:** Click "Sign in with Google" and authenticate with a valid `@sst.scaler.com` account.
- **Expected Result:**
  - Authentication succeeds.
  - User is redirected to `/student` (for students/testers) or `/admin` (for admins).
  - Session cookie is stored as HTTP-only SameSite cookie.
- **Evidence to Record:** Successful landing page URL, absence of redirect loops, user email in navigation header.

### Test 1.2: Unauthorized Domain Rejection (Negative Test)
- **Role Required:** Unauthorized Account (`@gmail.com`)
- **Setup:** Log out. Navigate to `/login`.
- **Action:** Authenticate with a personal non-Scaler Google account (`@gmail.com`).
- **Expected Result:**
  - Login fails closed.
  - User is denied access and redirected to `/login?error=domain_restricted`.
  - No session cookie is created; user profile is not provisioned.
- **Evidence to Record:** Error alert displayed on `/login`, 401/403 status in network log.

### Test 1.3: Role-Based Route Boundaries
- **Role Required:** Student Account
- **Setup:** Log in as Student.
- **Action:** Manually navigate to `/admin`, `/admin/exams`, and `/admin/question-bank`.
- **Expected Result:**
  - Student is strictly blocked from all admin routes.
  - Redirected to `/student` or `/login` with an unauthorized warning.
- **Evidence to Record:** Redirect trace, HTTP 403 / redirect in Network tab.

### Test 1.4: Clean Logout and Session Termination
- **Role Required:** Any authenticated account
- **Setup:** Logged in.
- **Action:** Click "Sign Out" in the user dropdown. Attempt to navigate back via browser "Back" button or directly enter `/student/exams`.
- **Expected Result:**
  - Session cookie is invalidated.
  - Browser back-button or direct URL access immediately redirects to `/login`.
- **Evidence to Record:** `/login` redirect, cleared session cookie in DevTools Application tab.

---

## 2. Admin Publishing and Assessment-Paper Assignment

### Test 2.1: Authoring Workspace Tree Navigation & Draft Inspection
- **Role Required:** Admin Account
- **Setup:** Log in as Admin. Navigate to `/admin/question-bank`.
- **Action:** Open a paper set template. Inspect sections, comprehension groups, and questions in the authoring tree.
- **Expected Result:**
  - Visual hierarchy renders correctly.
  - KaTeX math formulas render cleanly in previews.
  - Question options, marks, and answer keys are visible in the authoring modal.
- **Evidence to Record:** Screenshot of authoring tree, rendered math preview.

### Test 2.2: Paper Publishing & Version Immutability
- **Role Required:** Admin Account
- **Setup:** Open an editable paper template in `/admin/question-bank/papers/[paperId]`.
- **Action:** Click "Publish Paper". Confirm the publishing dialog.
- **Expected Result:**
  - Atomic publishing stored procedure creates a new immutable version in `paper_set_versions`.
  - A unique UUID version identifier is generated.
  - Paper status displays "Published" with timestamp.
  - Draft template remains available for future revisions without mutating the frozen version.
- **Evidence to Record:** Published version UUID in admin UI, success toast.

### Test 2.3: Assessment Event Subject & Paper Version Assignment
- **Role Required:** Admin Account
- **Setup:** Navigate to `/admin/exams`. Open or create an assessment event.
- **Action:** Assign a subject and select the newly published paper set version from the version dropdown.
- **Expected Result:**
  - Assessment subject row updates with the selected `paper_set_version_id`.
  - Invalidation helper clears any stale cache entries for that version.
  - If existing student attempts exist for this subject, the version dropdown is disabled with a warning: *"Cannot modify paper version: attempt(s) already exist."*
- **Evidence to Record:** Selected version ID in assessment subject card, freeze warning if attempts exist.

---

## 3. Student Exam Launch, Navigation, Autosaving, and Submission

### Test 3.1: Combined Multi-Subject Instruction & Subject Selection
- **Role Required:** Student Account
- **Setup:** Log in as Student with enrolled subjects. Navigate to `/student/exams`.
- **Action:** Click on an active assessment event. On the instruction page, select 2 subjects. Click "Begin Examination".
- **Expected Result:**
  - Pre-exam modal validates selected subjects.
  - Redirects to `/student/assessment/[id]/exam`.
  - Unified exam window loads showing top-bar subject tabs for both selected subjects.
  - Server-calculated authoritative clock displays correct duration (`Math.max(90, 2 * 60) = 120` minutes).
- **Evidence to Record:** Header tabs showing selected subjects, timer countdown start value.

### Test 3.2: Question Navigation, Palette State Updates & KaTeX Math
- **Role Required:** Student Account (in active exam)
- **Setup:** Exam in progress.
- **Action:**
  - Click through Questions 1 to 5 using Next button and direct question palette clicks.
  - Select an answer for Question 1.
  - Select an answer and click "Mark for Review" for Question 2.
  - Leave Question 3 unvisited.
- **Expected Result:**
  - Palette dynamically reflects accurate color codes:
    - Q1: Green (Answered)
    - Q2: Purple/Yellow (Marked for Review)
    - Q3: Red/Gray (Not Answered / Not Visited)
  - Mathematical equations render crisp HTML without KaTeX parsing delays.
  - Images load via short-lived signed CDN URLs without broken image icons.
- **Evidence to Record:** Palette screenshot showing distinct states, rendered math equations.

### Test 3.3: Non-Blocking Background Autosave & Network Dropout Recovery
- **Role Required:** Student Account (in active exam)
- **Setup:** In active exam. Open DevTools Network tab filtered to `actions`.
- **Action:**
  - Select an answer on Q4. Observe the header save indicator.
  - Simulate brief offline state (DevTools Network -> Offline) for 5 seconds, change answer, then restore Online.
- **Expected Result:**
  - UI never freezes or blocks clicks during saving.
  - Header displays "Saving..." -> "All changes saved".
  - During offline state, indicator displays "Unsaved - retrying...".
  - Upon network reconnection, queue flushes with exponential backoff and commits the latest response to PostgreSQL.
- **Evidence to Record:** Network request payload showing `save_response` RPC call, status transition from "Saving" to "All changes saved".

### Test 3.4: Manual Submission & Score Transcripts
- **Role Required:** Student Account (in active exam)
- **Setup:** Exam nearing completion or student ready to submit.
- **Action:** Click "Submit Exam" in the top bar. Confirm the submission modal.
- **Expected Result:**
  - Save queue flushes any pending responses.
  - Finalization RPC (`evaluate_and_finalize_attempt`) evaluates responses, Denormalizes max marks, and marks attempt `Completed`.
  - Student is routed to `/student/assessment/[id]?completed=true`.
  - Exam interface is locked; attempt cannot be resumed.
- **Evidence to Record:** Completion banner, evaluated score transcript on `/student/results`.

---

## 4. Completed-Attempt Re-Entry and Result Visibility

### Test 4.1: Blocked Re-Entry to Completed Attempt (Negative Test)
- **Role Required:** Student Account
- **Setup:** Completed exam attempt from Test 3.4.
- **Action:** Manually navigate to `/student/assessment/[id]/exam` or legacy route `/attempt/[attemptId]`.
- **Expected Result:**
  - System detects attempt status is `Completed`.
  - Student is strictly prevented from restarting the timer or modifying answers.
  - Automatically redirected to `/student/results/review/[attemptId]` (if answers released) or `/student/assessment/[id]?completed=true`.
- **Evidence to Record:** Immediate redirect trace, absence of active exam interface.

### Test 4.2: Answer Release Policy (Production vs Test)
- **Role Required:** Student Account
- **Setup:** Have one completed Production attempt and one completed Test attempt.
- **Action:** Navigate to `/student/results`.
- **Expected Result:**
  - **Test Assignment:** "Review Answers" button is immediately enabled. Clicking navigates to `/student/results/review/[attemptId]` showing full question explanations and correct answers.
  - **Production Assessment (with `release_answers = false`):** Answers and review links are hidden. Only summary score is displayed until administrator marks event `Completed` and sets `release_answers = true`.
- **Evidence to Record:** Immediate review access on Test attempt, review lock on Production attempt.

---

## 5. Tester-Only Assessment and Asset Restrictions

### Test 5.1: Tester Access to Test Assignment
- **Role Required:** Tester Account
- **Setup:** Log in as Tester. Assessment event configured with `assignment_type = 'TEST'` and `test_access_mode = 'TESTER_ONLY'`.
- **Action:** Open the Test assessment from `/student/exams`. Select subjects and begin test.
- **Expected Result:**
  - Tester can launch the test even without official academic enrollment in the course.
  - Questions and image assets load successfully.
  - Header displays "Exit Test" button.
- **Evidence to Record:** Successful test launch, rendered question images in tester session.

### Test 5.2: Tester Blocked from Production Assets (Security Test)
- **Role Required:** Tester Account
- **Setup:** Identify a storage asset path belonging strictly to a Production assessment (e.g. `/api/assets/papers/prod-paper-id/figure.png`).
- **Action:** Attempt to directly fetch or navigate to the production asset URL while logged in as Tester.
- **Expected Result:**
  - Server action/route strictly rejects request with HTTP 403 Forbidden.
  - Error response includes header `Cache-Control: private, no-store`.
  - Production exam figures are never exposed to tester accounts.
- **Evidence to Record:** HTTP 403 Forbidden status, response headers in DevTools Network tab.

### Test 5.3: Tester "Exit Test" Early Submission
- **Role Required:** Tester Account (in active test assignment)
- **Setup:** Test assignment in progress.
- **Action:** Click "Exit Test" button in header. Confirm modal.
- **Expected Result:**
  - Early submit lock is bypassed.
  - Save queue flushes, attempt is finalized, and user is cleanly redirected to results.
- **Evidence to Record:** Exit modal confirmation, successful redirect to test summary.

---

## 6. Fullscreen Enforcement and Attempt-Integrity Behavior

### Test 6.1: Fullscreen Prompt on Exam Entry
- **Role Required:** Student Account
- **Setup:** Launch an active examination.
- **Action:** Observe initial viewport.
- **Expected Result:**
  - Platform prompts student to enter full-screen mode before question interaction.
  - Fullscreen API request expands browser to fill screen.
- **Evidence to Record:** Fullscreen prompt dialog, browser entering fullscreen.

### Test 6.2: Fullscreen Exit Warning & Telemetry Dispatch
- **Role Required:** Student Account (in active exam)
- **Setup:** In active exam. Open DevTools Network tab filtered to `/api/exam/integrity`.
- **Action:** Press `Esc` key to exit browser fullscreen.
- **Expected Result:**
  - Fullscreen violation modal immediately overlays the interface, locking question interactions until fullscreen is restored.
  - Client telemetry queue captures `FULLSCREEN_EXIT` event with ISO timestamp.
  - Batched telemetry payload dispatches to `/api/exam/integrity` within 15 seconds.
- **Evidence to Record:** Violation modal overlay, telemetry POST request in Network tab.

### Test 6.3: Tab Switch & Window Blur Telemetry
- **Role Required:** Student Account (in active exam)
- **Setup:** Exam in fullscreen.
- **Action:** Switch to another application window or open another browser tab for 5 seconds, then return.
- **Expected Result:**
  - Page Visibility API records `VISIBILITY_HIDDEN` and `WINDOW_BLUR` events.
  - Telemetry dispatches to server.
  - In Admin Results (`/admin/results/[id]`), the student's row flags an Integrity Event badge with event counts.
- **Evidence to Record:** Dispatched telemetry in network log, integrity indicator in Admin console.

---

## 7. Paper Import Validation, Persistence Failures, and Recovery

### Test 7.1: Valid PDF Import & Extraction
- **Role Required:** Admin Account
- **Setup:** Log in as Admin. Navigate to `/admin/question-bank/import`.
- **Action:** Upload a clean, compliant examination PDF (under 20MB with valid `%PDF` header). Select target subject and paper set. Click "Start Import".
- **Expected Result:**
  - Upload succeeds without body-size error.
  - Streaming parser extracts sections, comprehension groups, questions, and options.
  - Extracted questions are inserted with verification status `Needs Review`.
  - Import job completes with status `Ready` and displays counts of created sections and questions.
- **Evidence to Record:** Import summary card showing `status: Ready`, extracted questions count.

### Test 7.2: File Size & Non-PDF File Rejection (Negative Test)
- **Role Required:** Admin Account
- **Setup:** In `/admin/question-bank/import`.
- **Action:**
  - Attempt to upload an executable (`.exe`) or image (`.png`).
  - Attempt to upload an empty file (0 bytes).
  - Attempt to upload a dummy file renamed to `.pdf` but lacking the `%PDF` magic header.
- **Expected Result:**
  - Client and Server Action reject the upload with an explicit error: *"Invalid file type. Only valid PDF files are supported."*
  - No database import job is created; no orphan rows created.
- **Evidence to Record:** Error toast message, network rejection response.

### Test 7.3: Truthful Persistence Failure & Rollback Reporting
- **Role Required:** Admin Account
- **Setup:** Import assistant with invalid payload or simulated database constraint violation.
- **Action:** Trigger an import containing malformed question data.
- **Expected Result:**
  - Server persistence rollback deletes any partially inserted sections created during the import.
  - Import job is marked `Failed` (never left in `Ready` or `Processing`).
  - Error message truthfully reports the failure and whether rollback succeeded (`rollback_succeeded: true`).
- **Evidence to Record:** Import job error banner displaying failure status without claiming questions were saved.

---

## 8. Resource Upload and Authorized Downloads

### Test 8.1: Valid Study Material Upload (PDF, DOCX, TXT)
- **Role Required:** Admin Account
- **Setup:** Navigate to `/admin/resources`.
- **Action:** Upload a valid PDF syllabus guide or DOCX formula sheet under 20MB. Set visibility to "Published".
- **Expected Result:**
  - Upload validates magic signature (`%PDF` or `PK\x03\x04`).
  - File is stored in Supabase storage and metadata record created atomically.
  - Resource appears in the Admin resource list.
- **Evidence to Record:** Success notification, resource entry in `/admin/resources`.

### Test 8.2: File Type & Traversal Protection (Negative Test)
- **Role Required:** Admin Account
- **Setup:** In `/admin/resources`.
- **Action:** Attempt to upload an unsupported extension (`.sh`, `.zip`) or empty file.
- **Expected Result:**
  - Upload is rejected with validation error: *"Unsupported file type."*
  - No storage object or database record is created.
- **Evidence to Record:** Error alert, absence of partial record.

### Test 8.3: Student Authorized Download & Restrictive Caching
- **Role Required:** Student Account
- **Setup:** Log in as Student. Navigate to `/student/resources`.
- **Action:** Click "Download" on a published resource. Inspect Network tab response headers for `/api/resources/[resourceId]/download`.
- **Expected Result:**
  - File streams successfully with sanitized filename in `Content-Disposition`.
  - Cache header: `Cache-Control: private, max-age=3600`.
- **Evidence to Record:** Downloaded file integrity, Network tab response headers.

### Test 8.4: Unpublished Resource Protection (Security Test)
- **Role Required:** Student Account
- **Setup:** Admin creates an "Unpublished" draft resource with ID `draft-res-uuid`.
- **Action:** Student attempts to download via direct URL `/api/resources/draft-res-uuid/download`.
- **Expected Result:**
  - Request rejected with HTTP 404 Not Found.
  - Header: `Cache-Control: private, no-store`.
  - Draft material is never exposed to students.
- **Evidence to Record:** HTTP 404 response status, `private, no-store` header.

---

## 9. Paper-Cache Freshness After Publishing a New Version

### Test 9.1: Cache Hit Performance on Repeated Exam Launch
- **Role Required:** Student Account
- **Setup:** Live exam assigned to published paper version `ver-1`.
- **Action:** Launch exam. Note initial load time. Refresh or re-enter exam in a new tab.
- **Expected Result:**
  - First launch populates in-memory `BoundedLruCache` and Next.js Data Cache.
  - Second launch retrieves paper structure instantaneously from memory without querying database tables.
- **Evidence to Record:** Sub-100ms response time on second load, zero duplicate database queries.

### Test 9.2: New Published Version Isolation & Freshness
- **Role Required:** Admin Account & Student Account
- **Setup:**
  - Admin updates the paper template in Question Bank and clicks "Publish Paper", creating `ver-2` (new UUID).
  - Admin assigns `ver-2` to an upcoming assessment.
- **Action:** Student launches the assessment with `ver-2`.
- **Expected Result:**
  - System recognizes the new version UUID, experiencing a mandatory cache miss for `ver-2`.
  - Fresh paper structure is loaded from PostgreSQL and cached under `ver-2`.
  - Outdated `ver-1` questions are never served to the new exam.
  - Existing student attempts that were previously started on `ver-1` continue to safely use `ver-1`.
- **Evidence to Record:** Exam displays updated questions, version UUID matches `ver-2`.

---

## 10. Unauthorized Access, Invalid Routes, and Protected-Resource Responses

### Test 10.1: Direct Asset Access Without Session (Negative Test)
- **Role Required:** Unauthenticated (Logged out)
- **Setup:** Open incognito window without active session.
- **Action:** Attempt to fetch an exam image directly: `GET /api/assets/papers/some-paper/q1.jpg`.
- **Expected Result:**
  - Request rejected with HTTP 401 Unauthorized.
  - Header: `Cache-Control: private, no-store`.
  - No exam graphics are viewable without authenticated session.
- **Evidence to Record:** HTTP 401 status, `Cache-Control: private, no-store` header in DevTools.

### Test 10.2: Path Traversal Attack on Asset Route (Negative Test)
- **Role Required:** Authenticated Student
- **Setup:** In active session.
- **Action:** Send request with path traversal: `GET /api/assets/papers/../../etc/passwd`.
- **Expected Result:**
  - Request rejected with HTTP 400 Bad Request.
  - Header: `Cache-Control: private, no-store`.
  - Traversal attempt blocked before reaching storage bucket.
- **Evidence to Record:** HTTP 400 Bad Request response.

### Test 10.3: Non-Existent Assessment Event Route
- **Role Required:** Student Account
- **Setup:** Logged in.
- **Action:** Navigate to invalid URL `/student/assessment/00000000-0000-0000-0000-000000000000`.
- **Expected Result:**
  - Handled gracefully via Next.js `notFound()` component.
  - Clean 404 page displayed without unhandled server exception or leaking database details.
- **Evidence to Record:** Next.js 404 Not Found page screenshot.

---

## 11. Student Feedback Centre Verification

### Test 11.1: Student Feedback Submission & Validation
- **Role Required:** Student Account
- **Setup:** Log in as Student. Navigate to `/student/feedback`.
- **Action:**
  1. Select Category "Question Correction".
  2. Select relevant Subject and enter Question Reference.
  3. Enter Title ("Option B LaTeX format error") and Description ("The integral denominator should be 2x instead of x^2.").
  4. Submit form.
- **Expected Result:**
  - Submission succeeds with green confirmation alert.
  - Form fields reset.
  - Submission immediately appears in "My Submissions" tab with Status `New`.
- **Evidence to Record:** Successful submission banner, newly populated record in "My Submissions".

### Test 11.2: Rapid Duplicate Submission Throttling
- **Role Required:** Student Account
- **Setup:** On `/student/feedback`.
- **Action:** Re-submit an identical title within 60 seconds.
- **Expected Result:**
  - Rejection with clear warning: "A submission with this title was already received just now."
  - Duplicate record is not created.
- **Evidence to Record:** Validation error message.

### Test 11.3: Admin Triage, Status Transition & Mandatory Outcome
- **Role Required:** Admin Account
- **Setup:** Log in as Admin. Navigate to `/admin/feedback`.
- **Action:**
  1. Filter by Status `New` or search for the submitted title.
  2. Click "Triage & Review".
  3. In the transition panel, change status to `Closed`.
  4. Verify that closure requires selecting an Outcome (`Implemented` or `Not Proceeding`).
  5. Select `Implemented`, enter a student-visible resolution note, and commit.
- **Expected Result:**
  - Status updates to `Closed` with outcome `Implemented`.
  - Item updates in admin table.
  - Audit history logs the transition with timestamp and actor name.
- **Evidence to Record:** Updated status badge, closure outcome pill, and history log.

### Test 11.4: Private Staff Internal Notes & Student Isolation
- **Role Required:** Admin Account / Student Account
- **Setup:**
  1. As Admin on `/admin/feedback`, open the item and add a private internal note: "Confidential syllabus revision verified."
  2. Log out and log in as the Submitting Student.
  3. Navigate to `/student/feedback` -> "My Submissions" and open "View Review Timeline".
- **Expected Result:**
  - Student sees Status `Closed`, Outcome `Implemented`, and student-visible resolution note.
  - Student sees status change timeline.
  - Private staff note is STRICTLY ABSENT from student UI and response network payloads.
- **Evidence to Record:** Student detail modal showing absence of internal notes.

### Test 11.5: Multi-Category Submissions & Input Boundary Validation
- **Role Required:** Student Account
- **Setup:** Log in as Student. Navigate to `/student/feedback`.
- **Action:**
  1. Test each of the 4 supported categories: `Feature Request`, `Bug Report`, `Question Correction`, `General Feedback`.
  2. Test input bounds: Title < 3 characters (rejected) and > 200 characters (truncated/rejected); Description < 10 characters (rejected) and > 5000 characters (rejected).
  3. Attach contextual metadata: Select subject, assessment event, question reference, and page URL.
- **Expected Result:**
  - Invalid submissions display immediate client-side and server-action validation errors without submitting to the database.
  - Valid submissions for all 4 categories succeed and display their category badge in "My Submissions".
- **Evidence to Record:** Form validation error banners, category badges in submission list.

### Test 11.6: Cross-Student Isolation in "My Submissions"
- **Role Required:** Student Account A & Student Account B
- **Setup:** Student A submits an item ("Student A Confidential Bug"). Student B logs in on an independent browser session.
- **Action:** Student B navigates to `/student/feedback` -> "My Submissions".
- **Expected Result:**
  - Student B's list contains only Student B's submissions. Student A's item is strictly invisible.
  - Direct database queries or API parameter tampering cannot expose Student A's records (guaranteed by RLS policy `Users read own feedback or admin reads all`).
- **Evidence to Record:** Student B submissions table showing 0 rows for Student A's items.

### Test 11.7: Student Inability to Modify Protected Workflow Fields / Parameter Spoofing
- **Role Required:** Student Account
- **Setup:** Inspect network tab or execute server action with modified parameters.
- **Action:**
  1. Student attempts to invoke `update_feedback_status_v1` or update status/outcome directly.
  2. Student invokes `submit_student_feedback_v1` passing a spoofed `p_user_id` belonging to Student B.
- **Expected Result:**
  - Direct status modification is rejected with "Administrator privileges required" or 0 rows updated by RLS.
  - Submitter spoofing is overridden: The RPC strictly binds `user_id` to `auth.uid()`, discarding client parameter spoofing.
- **Evidence to Record:** Server rejection response, database verification of actual submitter ID.

### Test 11.8: Concurrent Rate Limiting & Burst Throttling
- **Role Required:** Student Account
- **Setup:** Student initiates multiple rapid feedback submissions.
- **Action:**
  1. Submit 4 distinct items within 2 minutes.
  2. Rapidly dispatch concurrent submissions across multiple browser tabs.
- **Expected Result:**
  - Submissions 1–3 succeed.
  - Submission 4 is throttled with: "You are submitting feedback too quickly. Please wait a couple of minutes."
  - Advisory locks serialize concurrent requests, preventing burst limit bypass via race conditions.
- **Evidence to Record:** Rate limit warning banner on 4th submission.

### Test 11.9: Graceful Fail-Closed Behavior on Database Procedure Unavailability
- **Role Required:** Student Account
- **Setup:** Test environment where stored procedure raises exception or is temporarily unavailable.
- **Action:** Submit feedback form.
- **Expected Result:**
  - Action fails closed gracefully with a clean user-facing error message: "Unable to submit feedback at this time. Please try again later."
  - No crash, unhandled 500 white-screen, stack trace leakage, or orphan partial record creation.
- **Evidence to Record:** User-friendly alert banner screenshot.

### Test 11.10: Optional Feedback Email Configuration
- **Role Required:** Any User
- **Setup:**
  - Scenario A: `NEXT_PUBLIC_FEEDBACK_EMAIL` configured with an email address.
  - Scenario B: `NEXT_PUBLIC_FEEDBACK_EMAIL` unset or empty.
- **Action:** Navigate to `/student/feedback`.
- **Expected Result:**
  - Scenario A: Renders a direct `mailto:` link allowing students to contact administrators via email.
  - Scenario B: The mailto link is cleanly omitted; UI displays standard in-portal ticketing guidance without broken links or missing elements.
- **Evidence to Record:** Header/footer contact area screenshot in both scenarios.

---

## 12. Platform-Wide Responsive Design & Viewport Validation

### Responsive Design Philosophy & Policy
1. **Live Mock Examinations:** Laptop-first, optimized primarily for 1280 × 720, 1366 × 768, and 1440 × 900 classroom examination use. When opened on viewports below 1024px, a non-disruptive, dismissible advisory banner appears informing students that live examinations are optimized for laptops. This advisory does not block testing, does not trigger database writes, and does not interfere with timers, autosave, or fullscreen integrity.
2. **Exam Review & Answer Keys:** Fully responsive across mobile phones (320px–430px), tablets, and laptops without device restriction.
3. **Student Dashboards & Portal Pages:** Fully responsive across mobile, tablet, and desktop with flexible grid layouts and mobile drawer navigation.
4. **Admin Management & Tables:** Desktop-first for authoring and triage, with slide-over drawer navigation on screens below 1024px and horizontally scrollable table containers preventing clipping of actions (e.g. `Manage Event →`).

### Target Viewports
- **Mobile Phones:** 320px (minimum mobile width), 360px, 390px (iPhone), 430px (iPhone Pro Max)
- **Tablets:** 768px (iPad portrait), 1024px (iPad landscape / breakpoint)
- **Laptops & Desktops:** 1280 × 720, 1366 × 768 (standard classroom laptop), 1440 × 900, 1920 × 1080

### Test 12.1: Admin Exams Table Action Visibility (Clipped Manage Fix)
- **Role Required:** Admin
- **Viewports:** 1280 × 720, 1366 × 768, 1440 × 900, 768px, 390px
- **Setup:** Log in as Admin. Navigate to `/admin/exams`.
- **Action:** Inspect the Exams & Assessment Events table across standard laptop resolutions and smaller screens.
- **Expected Result:**
  - On desktop/laptop (1280px–1920px), the `Manage Event →` action button is completely visible and clickable without horizontal clipping.
  - On tablet and mobile viewports, the table container scrolls horizontally within its card container (`overflow-x-auto`) without generating an accidental page-level horizontal window blowout.
  - Event title wraps cleanly without inflating column width.
- **Evidence to Record:** Screenshot of `/admin/exams` showing the fully visible `Manage Event →` link at 1280px and 1366px.

### Test 12.2: Admin Mobile Navigation Drawer
- **Role Required:** Admin
- **Viewports:** 390px, 768px (< 1024px)
- **Setup:** Navigate to `/admin`.
- **Action:** Tap the hamburger menu button in the top header. Navigate between sections. Press Escape or tap the backdrop to dismiss.
- **Expected Result:**
  - Sidebar collapses into a mobile slide-over drawer below 1024px.
  - Backdrop prevents interaction with background while open.
  - Drawer dismisses cleanly via close button, backdrop tap, route link click, or Escape key.
  - On screens ≥ 1024px, sidebar returns to fixed desktop layout.

### Test 12.3: Student Header Mobile Navigation
- **Role Required:** Student
- **Viewports:** 320px, 390px, 768px
- **Setup:** Navigate to `/student`.
- **Action:** Tap the mobile hamburger menu icon. Inspect user email, links, and Sign Out action. Press Escape to dismiss.
- **Expected Result:**
  - Menu opens smoothly with backdrop overlay.
  - User email truncates cleanly without horizontal page blowout.
  - Escape key and link selection close the menu.

### Test 12.4: Active Exam Laptop-First Layout & Mobile Advisory
- **Role Required:** Student / Tester
- **Viewports:** 1280 × 720, 1366 × 768, 768px, 390px
- **Setup:** Launch an exam session via `/student/assessment/[id]/exam`.
- **Action:**
  - Test at 1280 × 720 and 1366 × 768: Inspect question content, KaTeX math formulas, timer badge, question palette, action bar buttons.
  - Resize or open at < 1024px: Inspect advisory banner and Question Palette drawer trigger. Tap "Dismiss".
- **Expected Result:**
  - At laptop resolutions, Question Palette is pinned to the right (`w-72`), timer is prominent, and formula blocks wrap/scroll safely without overflowing the viewport.
  - Below 1024px, a non-blocking "Laptop Advisory" banner appears informing students that live exams are optimized for laptops.
  - The advisory can be dismissed via "Dismiss" without affecting attempt state or creating database writes.
  - The Question Palette collapses into an on-demand drawer accessed via the "Question Palette" button.
  - ExamActionBar buttons wrap gracefully without falling off-screen.

### Test 12.5: Completed Exam Review on Mobile Devices
- **Role Required:** Student
- **Viewports:** 320px, 390px, 768px
- **Setup:** Navigate to `/student/results/review/[attemptId]`.
- **Action:** Inspect score summary card, status filter pills, jump-to-question buttons, question cards, option cards, and mathematical explanations on phone screen.
- **Expected Result:**
  - Score box stacks neatly on phone screens.
  - Status filter pills ("All", "Correct", "Incorrect", "Unanswered") wrap into multiple lines without overflowing.
  - MSQ policy notice and option cards collapse to vertical orientation.
  - Display math equations scroll internally (`overflow-x-auto`) without widening the viewport.
  - No laptop restriction or advisory is shown for exam reviews.

### Test 12.6: Feedback Centre Responsiveness
- **Role Required:** Student & Admin
- **Viewports:** 390px, 768px, 1280px
- **Setup:** Navigate to `/student/feedback` and `/admin/feedback`.
- **Action:** Open submission form, triage slide-over, and history timeline modal.
- **Expected Result:**
  - Category selector, title, description, and context dropdowns fill the container.
  - Modal dialogs scroll vertically within `max-h-[75vh]` without escaping the screen.
  - Admin feedback triage panel fits comfortably on tablet and mobile viewports.

---

## Summary Testing Verification Matrix

| Checklist Section | Target Role | Primary Expected Outcome | Automated Unit Tests | DB Integration Tests | Manual Browser Status |
|---|---|---|---|---|---|
| 1. Auth & RBAC | Admin / Student / Public | Domain restriction, role gating, session invalidation | Passed (5 suites) | Verified | Pending Browser Run |
| 2. Publishing & Assignment | Admin | Immutable snapshots, version UUIDs, freeze locks | Passed (5 suites) | Verified | Pending Browser Run |
| 3. Exam Engine & Autosave | Student | Multi-subject tabs, non-blocking save, auto-submit | Passed (5 suites) | Verified | Pending Browser Run |
| 4. Completed Attempts & Review | Student | Re-entry locked, gated answer release | Passed (5 suites) | Verified | Pending Browser Run |
| 5. Tester Assignments | Tester | Tester-only access, prod asset block, early exit | Passed (5 suites) | Verified | Pending Browser Run |
| 6. Fullscreen & Telemetry | Student | Fullscreen lock, blur telemetry dispatch | Passed (11 tests) | Verified | Pending Browser Run |
| 7. Paper Import & Rollback | Admin | 20MB limit, magic check, rollback reporting | Passed (43 tests) | Verified | Pending Browser Run |
| 8. Academic Resources | Student / Admin | File type verification, private streaming | Passed (43 tests) | Verified | Pending Browser Run |
| 9. Paper Cache Freshness | Student / Admin | LRU hit performance, version UUID freshness | Passed (23 tests) | Verified | Pending Browser Run |
| 10. Security & Negative Tests | Public / Student | 401/403/404 fail-closed, `private, no-store` headers | Passed (5 suites) | Verified | Pending Browser Run |
| 11. Student Feedback Centre | Student / Admin | Category routing, rate limiting, closure outcomes, zero note leaks | Passed (21 tests) | Verified (1–42) | Pending Browser Run |
| 12. Responsive Design & Viewport Support | All Roles | Mobile drawer nav, laptop-first exam, mobile review, table overflow fix | Passed (tsc/build/lint) | Verified | Pending Browser Run |

*Note: Automated unit/logic suites (109 tests), TypeScript typechecks, ESLint, Next.js production builds, and git whitespace checks have fully passed. Manual browser checks are verified as ready for execution and await live browser testing across user roles.*

## 13. Light and dark appearance

- On a fresh browser profile, check that login follows the device theme. Toggle the sun/moon button using keyboard Enter or Space and confirm the next action is named in its tooltip.
- Reload, navigate between pages, and open a second tab on the same origin. The selected mode should persist and update in both tabs. Changing the device theme should affect only browsers without a saved override.
- As admin, inspect dashboard cards, sidebar/mobile drawer, exams/results tables, authoring forms, dropdowns, feedback badges, and dialogs in both themes. Open existing records without saving edits.
- As student, inspect dashboard, exams, results, review, resources, profile, classes, and feedback in both themes. Verify text, borders, selected states, and keyboard focus remain visible.
- In an explicitly designated TEST session, check the in-exam toggle, timer, math, palette, calculator, and submission dialog. Switching themes must not reset the timer, answers, fullscreen state, or selected subject. Do not start a production attempt for this check.
- Inspect at 390px and laptop width; theme controls should remain reachable without obscuring navigation or exam controls. Academic images retain a white canvas so black diagrams remain readable.
- Check the console for hydration errors and the network panel for failed requests. Appearance changes should produce no Supabase writes.

Browser execution of these checks is pending whenever no browser connection is available; a passing build does not imply visual verification.

## Question and option image authoring

Automated component, local HTTP, and local/remote database checks are described in [Question authoring](FEATURES.md#question-authoring). For visual release QA:

1. Confirm a new question and its options start as text. Switch each independently to Image; confirm image-only saves work, and optional text can be added or removed.
2. Upload PNG/JPEG images and confirm actual pixels appear immediately and after saving/reopening. Check both imported and manually uploaded images.
3. Adjust size with keyboard input and the slider; compare admin/student sizing at equal content widths. Check narrow screens, themes, exam pages, and answer review.
4. Check invalid/oversized files, retry, removing images, cancelling, and disabled save during upload. Confirm unauthorized roles cannot upload or preview unrelated assessments.
5. Publish/re-publish a test paper and verify older attempts keep their original content and sizes.

Hosted visual review remains pending; automated checks do not replace it.
