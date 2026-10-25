# Student exam review and practice

Results has an **Exam Review** tab for choosing a submitted paper. Opening it shows one question at a time in the exam workspace, with subject tabs, passages, diagrams, maths, code, reference data, a calculator, and a question palette. Students see their submitted response and whether it is correct, incorrect, or unanswered. Incorrect and unanswered questions show a **Show correct answer** button. Answer keys are fetched only after that button is clicked; they are omitted from the initial browser payload. Reloading hides revealed answers again.

**Practice** is a separate student navigation item. Students can also choose **Practise this paper** from a review. Practice is untimed, unlimited, and per subject. It uses the exact published paper version from the student's original attempt. Progress and marked questions save automatically; **Save & exit** waits for saving before leaving. An unfinished session resumes rather than creating a duplicate. Finishing asks for confirmation, saves the responses and server-calculated score, and opens the practice review. Completed sessions remain in the Practice page, and students can practise again.

## Student and tester views

Regular students see only normal exams. Their Practice library contains only subject papers from their own completed exam attempts, including the subjects they actually selected. They do not see TEST assignments, test/production filters, or internal tester language. The normal label is **Exam**.

Testers see a **Tester Portal** and can review/practise papers from their own TEST and PRODUCTION attempts, with explicit assignment labels and review filters. Neither role receives a general library of unattempted papers. Changing a tester to student immediately hides old TEST practice sessions and blocks their direct links without deleting the saved records.

Role restrictions apply to dashboard/exam listings, details, live exam routes, reviews, answer reveal, practice start/resume/save, and practice history. Supabase restricts TEST event/subject/attempt reads and direct test-start RPC calls as well. Existing ALL_ENROLLED TEST assignments are now restricted to testers/admins; a student must use a normal PRODUCTION exam.

## When papers unlock

| Assignment | Review and personal practice |
| --- | --- |
| TEST | Available after the student's attempt is completed and its result is evaluated, even while the assignment remains live. Existing limited/unlimited test retake rules continue to govern actual test retakes. |
| PRODUCTION | Available after the student's attempt is completed, its result is evaluated, and the event is Completed or Archived. Finishing early does not unlock an active production paper. |

Review, answer reveal, starting/resuming practice, saving, and practice answer reveal all enforce the same release rule on the server. Users can only use their own source attempts and practice sessions.

## How results are stored

`student_practice_sessions` stores the source attempt ID, student ID, response JSON, marked questions, timestamps, revision, completion state, and final score/maximum marks. It does not create official `attempts` or `results` rows and does not consume a TEST attempt allowance. MCQ requires the correct option; MSQ requires the complete correct set without partial credit; numerical questions use the published exact value or inclusive range. Completed practice is read-only. A revision check rejects stale saves from another tab.

The migrations are `20261024000045_student_practice.sql` (practice storage) and `20261024000046_role_scoped_exam_access.sql` (role access), plus `20261024000047_attempt_subject_review_visibility.sql` (subject visibility follows actual attempts even when enrollment changes). Students have read access to their own practice records; authenticated clients cannot insert/update scores directly. Authenticated server actions validate ownership, release, question IDs, response shapes and option IDs before service-role writes.

## Verification in the deployed app

1. As a tester, finish an evaluated TEST attempt. Open Results → Exam Review → Review paper. Check subject switching, passages, images, maths, numerical responses, calculator, previous/next and palette filters.
2. Open an incorrect and an unanswered question. Confirm the correct answer is hidden, then click Show correct answer. Navigate away/back to confirm it stays revealed for the current view; reload to confirm it is hidden again. Correct questions should simply confirm the submitted response.
3. For a PRODUCTION event that is still Live, confirm review and practice remain locked. After the admin marks it Completed and evaluation is finished, confirm both unlock. Pending evaluations stay locked for either assignment type.
4. Start practice, answer MCQ/MSQ/numerical questions, clear a response, and mark a question. Wait for All changes saved, then Save & exit. Resume and confirm saved responses/marks. Check desktop and mobile layouts.
5. Finish practice and check its score and question statuses. Reveal an incorrect answer. Confirm the session appears in Practice history and another practice can be started.
6. As a student, check Dashboard, Exams, Results and Practice: only normal exams and their own completed subject papers should appear, with no TEST/PRODUCTION filters or tester terminology. Try an old TEST review/practice link: it must be blocked. As a tester, confirm both own assignment types appear.
7. Confirm official results and the TEST retake allowance did not change. Test two tabs on the same practice: a stale write should fail with a reload message rather than overwrite newer work. Another student's practice URL must be inaccessible.

## Automated checks

- `npm test`: grading, answer-key omission, reveal-button interactions, release rules, and existing regression coverage.
- `npm run build -- --webpack`: production build with type checks. This environment's default Turbopack build cannot bind its CSS-worker port.
- `supabase db query --local -f supabase/tests/role_scoped_exam_access.sql` (or `--linked`): transaction-only role checks covering old TEST records, own paper access, test-start RPC restrictions, tester retakes and immediate role changes.
- `supabase db query --local -f supabase/tests/student_practice.sql` (or `--linked`): transaction-only database checks for ownership, write restrictions, active-session uniqueness, repeat practice and revision conflicts. The success signal rolls back all fixtures.

Browser-based visual verification requires a connected browser. No connected browser was available during implementation; use the deployed-app steps above to complete visual acceptance.
