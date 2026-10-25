# Production release checks

Use these checks after the dark-mode release is deployed. No hosted load test is part of this release. The theme preference is stored only in the browser and requires no new migration.

## 1. Confirm the deployed version

- In Vercel, open the production deployment and confirm **Ready**, the intended GitHub `main` commit, and the correct production domain. A successful GitHub push does not prove a successful deployment.
- Open that domain in a fresh tab and confirm the sun/moon control appears on the login page. If it is absent, check the deployment commit and refresh before investigating theme behavior.
- Local and GitHub source should match (`git rev-parse HEAD` and `git ls-remote origin refs/heads/main`). Pre-existing untracked local scripts are outside the release and are intentionally not published.

## 2. Confirm migration synchronization

There are 44 migration files through `20261023000044_fix_question_authoring.sql`. Migration 44 fixes schema qualification in authoring/publishing triggers and permits image-only content in the atomic save RPC.

Use the installed Supabase CLI from the repository root:

```sh
supabase migration list --local
supabase migration list --linked
supabase db push --linked --dry-run --skip-vault
```

Both histories should match the files; the dry run should report no pending migrations. The cached CLI may be used by its full path when `supabase` is not installed globally. Do not run a database reset, seed, migration repair, or a real push merely to perform this check.

## 3. Check appearance and read-only workflows

1. On login, switch to dark mode, reload, and navigate to signup and back. The mode should persist without a light flash or hydration error.
2. Sign in as an admin. Inspect existing dashboard cards, exams/results tables, question previews, feedback records, and the mobile navigation drawer. Toggle both ways. Check text, inputs, menus, borders, selected rows, and focus outlines; close forms without saving.
3. Sign in as a student. Inspect dashboard, existing exam listings, results/review, resources, profile, classes, and feedback. Confirm academic diagrams and math remain readable in both themes. Use a separate browser profile if checking both roles simultaneously.
4. Open a second tab on the same domain. Toggling in one tab should update the other. With no saved override, the device color scheme supplies the initial theme; an explicit saved choice takes priority. Reset `iitm-theme` in browser site storage only if deliberately checking the device default.
5. At phone and laptop widths, confirm the toggle and navigation controls remain reachable. Check the developer console for hydration/runtime errors and failed application requests.

These steps use existing records. Opening protected pages can refresh authentication sessions, as usual. They do not require creating exams, changing enrollments, submitting feedback, or starting real exam attempts.

## 4. Optional exam interaction check

Use a dedicated tester and an explicitly designated **TEST assignment** only. This check creates test attempt/response/result records; skip it when no writes at all are desired.

Confirm switching theme preserves answers, selected subject, timer, fullscreen state, and calculator contents. Check the question palette, math, reference material, calculator, save indicator, and submission dialog. Complete the TEST session and confirm its test result. Never use a real production exam as a release smoke test.

## Evidence and limits

Record the deployed commit, browser, viewport, roles/pages checked, console errors, and any screenshots of unreadable content. Current lint, type checks, and production build can establish code correctness gates; they do not replace authenticated visual verification.

The earlier local 300-student test used concurrent HTTP page requests and RPC calls, with paced login/start/save phases. A same-instant submission burst had 35 initial failures out of 300; spreading submissions over three seconds succeeded. This does not certify hosted capacity. The disposable load-test resources were removed at the user's request. No additional load test should be started as part of these release checks.

## Question image release

Apply migration 44 before releasing the simplified editor. Its rollback-only database suite passed locally and remotely; authenticated local upload/preview/save/reopen/CDN checks passed. Confirm all 44 migration versions match local files, the local database, and the linked project, with no pending migrations. Confirm the deployment commit is Ready and execute the [image authoring visual checks](MANUAL_TESTING_CHECKLIST.md#question-and-option-image-authoring) as admin and eligible student/tester.
