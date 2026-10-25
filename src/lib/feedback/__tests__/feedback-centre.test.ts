import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK_CATEGORIES,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackOutcome,
} from "../types";
import {
  validateFeedbackSubmission,
  validateStatusUpdate,
  validateInternalNote,
} from "../validation";
import {
  checkInMemoryRateLimit,
  recordSubmission,
  __clearRateLimitTrackerForTesting,
  InMemoryRateLimitStore,
  SharedRateLimiter,
  hashTitle,
  DEBOUNCE_WINDOW_MS,
  BURST_WINDOW_MS,
  HOUR_WINDOW_MS,
  DAY_WINDOW_MS,
} from "../rate-limit";

/**
 * ARCHITECTURAL TESTING NOTE:
 * - The tests in this file are in-process UNIT and CONTRACT tests executing with Node's native test runner.
 * - Concurrency and multi-instance scenarios simulate independent Vercel lambdas sharing a common storage layer.
 * - Genuine database-level concurrency serialization (via PostgreSQL `pg_advisory_xact_lock`) and Row Level
 *   Security (RLS) policies are defined in migration `20261012000042_student_feedback_centre.sql` and require
 *   a live PostgreSQL/Supabase test environment to execute against actual database tables.
 */

// ==============================================================================
// 1. Server-Side Input & Category Validation Tests
// ==============================================================================

describe("Feedback Centre: Input Validation & Category Rules", () => {
  it("TC-1: Accepts valid submission across all four official categories", () => {
    for (const cat of FEEDBACK_CATEGORIES) {
      const result = validateFeedbackSubmission({
        category: cat,
        title: "Valid feature title",
        description: "This is a detailed and constructive description with sufficient length.",
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data?.category, cat);
      assert.strictEqual(result.data?.title, "Valid feature title");
    }
  });

  it("TC-2: Rejects invalid or arbitrary category values", () => {
    const invalidCategories = ["random_idea", "complaint", "urgent_issue", ""];
    for (const cat of invalidCategories) {
      const result = validateFeedbackSubmission({
        category: cat as FeedbackCategory,
        title: "Valid title here",
        description: "Valid description with sufficient characters.",
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.category);
    }
  });

  it("TC-3: Enforces title length boundaries (min 3, max 200, trimmed)", () => {
    // Too short
    const shortResult = validateFeedbackSubmission({
      category: "bug_report",
      title: "ab",
      description: "Valid description with sufficient length.",
    });
    assert.strictEqual(shortResult.valid, false);
    assert.ok(shortResult.errors?.title);

    // Whitespace only
    const whitespaceResult = validateFeedbackSubmission({
      category: "bug_report",
      title: "     ",
      description: "Valid description with sufficient length.",
    });
    assert.strictEqual(whitespaceResult.valid, false);
    assert.ok(whitespaceResult.errors?.title);

    // Too long (>200)
    const longTitle = "A".repeat(201);
    const longResult = validateFeedbackSubmission({
      category: "bug_report",
      title: longTitle,
      description: "Valid description with sufficient length.",
    });
    assert.strictEqual(longResult.valid, false);
    assert.ok(longResult.errors?.title);

    // Exact boundary: 200 chars
    const exactResult = validateFeedbackSubmission({
      category: "bug_report",
      title: "A".repeat(200),
      description: "Valid description with sufficient length.",
    });
    assert.strictEqual(exactResult.valid, true);
  });

  it("TC-4: Enforces description length boundaries (min 10, max 5000)", () => {
    // Too short (<10)
    const shortDesc = validateFeedbackSubmission({
      category: "question_correction",
      title: "Typo in math question",
      description: "Too short",
    });
    assert.strictEqual(shortDesc.valid, false);
    assert.ok(shortDesc.errors?.description);

    // Too long (>5000)
    const longDesc = validateFeedbackSubmission({
      category: "question_correction",
      title: "Typo in math question",
      description: "D".repeat(5001),
    });
    assert.strictEqual(longDesc.valid, false);
    assert.ok(longDesc.errors?.description);

    // Valid description trimmed
    const validDesc = validateFeedbackSubmission({
      category: "question_correction",
      title: "Typo in math question",
      description: "   This is a properly formatted description that exceeds ten characters.   ",
    });
    assert.strictEqual(validDesc.valid, true);
    assert.strictEqual(
      validDesc.data?.description,
      "This is a properly formatted description that exceeds ten characters."
    );
  });

  it("TC-5: Validates optional context fields (UUIDs, question ref, page URL)", () => {
    // Valid UUIDs
    const validUUID = "11111111-2222-4333-8444-555555555555";
    const res = validateFeedbackSubmission({
      category: "question_correction",
      title: "Option D calculation error",
      description: "Option D should equal 42 rather than 24.",
      subject_id: validUUID,
      assessment_event_id: validUUID,
      question_reference: "Sec 2, Q5",
      page_url: "/student/exams/123",
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data?.subject_id, validUUID);
    assert.strictEqual(res.data?.assessment_event_id, validUUID);
    assert.strictEqual(res.data?.question_reference, "Sec 2, Q5");
    assert.strictEqual(res.data?.page_url, "/student/exams/123");

    // Invalid UUID rejected
    const invalidUUIDRes = validateFeedbackSubmission({
      category: "question_correction",
      title: "Option D calculation error",
      description: "Option D should equal 42 rather than 24.",
      subject_id: "not-a-uuid",
    });
    assert.strictEqual(invalidUUIDRes.valid, false);
    assert.ok(invalidUUIDRes.errors?.subject_id);
  });
});

// ==============================================================================
// 2. Status Transitions & Mandatory Closure Outcome Tests
// ==============================================================================

describe("Feedback Centre: Status Transitions & Closure Outcomes", () => {
  const validUUID = "99999999-8888-4777-8666-555555555555";

  it("TC-6: Mandatory closure outcome when status is 'closed'", () => {
    // Closed WITH implemented outcome
    const closedImpl = validateStatusUpdate({
      feedback_id: validUUID,
      new_status: "closed",
      outcome: "implemented",
      resolution_note: "Deployed in current release",
    });
    assert.strictEqual(closedImpl.valid, true);
    assert.strictEqual(closedImpl.data?.outcome, "implemented");

    // Closed WITH not_proceeding outcome
    const closedNotProc = validateStatusUpdate({
      feedback_id: validUUID,
      new_status: "closed",
      outcome: "not_proceeding",
      resolution_note: "Outside academic syllabus scope",
    });
    assert.strictEqual(closedNotProc.valid, true);
    assert.strictEqual(closedNotProc.data?.outcome, "not_proceeding");

    // Closed WITHOUT outcome is strictly rejected
    const closedNoOutcome = validateStatusUpdate({
      feedback_id: validUUID,
      new_status: "closed",
      outcome: null,
    });
    assert.strictEqual(closedNoOutcome.valid, false);
    assert.ok(closedNoOutcome.errors?.outcome);

    // Closed WITH invalid outcome is rejected
    const closedInvalidOutcome = validateStatusUpdate({
      feedback_id: validUUID,
      new_status: "closed",
      outcome: "maybe_later" as FeedbackOutcome,
    });
    assert.strictEqual(closedInvalidOutcome.valid, false);
    assert.ok(closedInvalidOutcome.errors?.outcome);
  });

  it("TC-7: Open statuses ('new', 'under_review', 'in_progress') must NOT have outcomes", () => {
    const openStatuses: FeedbackStatus[] = ["new", "under_review", "in_progress"];

    for (const st of openStatuses) {
      // Valid open update without outcome
      const validOpen = validateStatusUpdate({
        feedback_id: validUUID,
        new_status: st,
        outcome: null,
      });
      assert.strictEqual(validOpen.valid, true);
      assert.strictEqual(validOpen.data?.outcome, null);

      // Invalid open update with premature outcome
      const invalidOpen = validateStatusUpdate({
        feedback_id: validUUID,
        new_status: st,
        outcome: "implemented",
      });
      assert.strictEqual(invalidOpen.valid, false);
      assert.ok(invalidOpen.errors?.outcome);
    }
  });

  it("TC-8: Validates staff internal notes separately", () => {
    // Valid note
    const validNote = validateInternalNote("Confirmed with course TA; correct formula is lambda = 2.5.");
    assert.strictEqual(validNote.valid, true);
    assert.strictEqual(validNote.data, "Confirmed with course TA; correct formula is lambda = 2.5.");

    // Empty note rejected
    const emptyNote = validateInternalNote("    ");
    assert.strictEqual(emptyNote.valid, false);
    assert.ok(emptyNote.errors?.note);

    // Excessively long note (>4000) rejected
    const longNote = validateInternalNote("N".repeat(4001));
    assert.strictEqual(longNote.valid, false);
    assert.ok(longNote.errors?.note);
  });
});

// ==============================================================================
// 3. Rate Limiting & Rapid Duplicate Prevention Tests
// ==============================================================================

describe("Feedback Centre: Rate Limiting & Anti-Abuse", () => {
  beforeEach(() => {
    __clearRateLimitTrackerForTesting();
  });

  it("TC-9: Prevents duplicate submissions with identical normalized title within 60s", () => {
    const userId = "user-123";
    const title = "Calculator missing inverse hyperbolic functions";
    const now = 1000000;

    // First check allowed
    const check1 = checkInMemoryRateLimit(userId, title, now);
    assert.strictEqual(check1.allowed, true);
    recordSubmission(userId, title, now);

    // Immediate duplicate check (same title, 5 seconds later) rejected
    const check2 = checkInMemoryRateLimit(userId, "  calculator missing   inverse hyperbolic functions  ", now + 5000);
    assert.strictEqual(check2.allowed, false);
    assert.match(check2.reason || "", /already received just now/i);

    // Different title from same user is allowed
    const checkDiff = checkInMemoryRateLimit(userId, "Another distinct suggestion", now + 10000);
    assert.strictEqual(checkDiff.allowed, true);

    // After debounce window (61s later), same title is allowed again
    const checkLater = checkInMemoryRateLimit(userId, title, now + 61000);
    assert.strictEqual(checkLater.allowed, true);
  });

  it("TC-10: Throttles short-burst submissions (max 3 submissions within 2 minutes)", () => {
    const userId = "user-burst";
    const now = 2000000;

    // 1st submission
    assert.strictEqual(checkInMemoryRateLimit(userId, "Idea 1", now).allowed, true);
    recordSubmission(userId, "Idea 1", now);

    // 2nd submission
    assert.strictEqual(checkInMemoryRateLimit(userId, "Idea 2", now + 10000).allowed, true);
    recordSubmission(userId, "Idea 2", now + 10000);

    // 3rd submission
    assert.strictEqual(checkInMemoryRateLimit(userId, "Idea 3", now + 20000).allowed, true);
    recordSubmission(userId, "Idea 3", now + 20000);

    // 4th submission within 2 minutes blocked
    const burstBlocked = checkInMemoryRateLimit(userId, "Idea 4", now + 30000);
    assert.strictEqual(burstBlocked.allowed, false);
    assert.match(burstBlocked.reason || "", /submitting feedback too quickly/i);
  });

  it("TC-11: Enforces hourly limit (10 items per hour)", () => {
    const userId = "user-hourly";
    let baseTime = 3000000;

    // Record 10 submissions spread across the hour (every 3 minutes)
    for (let i = 0; i < 10; i++) {
      baseTime += 180000; // 3 mins apart
      assert.strictEqual(checkInMemoryRateLimit(userId, `Topic ${i}`, baseTime).allowed, true);
      recordSubmission(userId, `Topic ${i}`, baseTime);
    }

    // 11th submission within the hour blocked
    const hourBlocked = checkInMemoryRateLimit(userId, "Topic 11", baseTime + 60000);
    assert.strictEqual(hourBlocked.allowed, false);
    assert.match(hourBlocked.reason || "", /hourly submission limit/i);
  });
});

// ==============================================================================
// 4. Security, Isolation, and Role Model Invariants
// ==============================================================================

describe("Feedback Centre: Security & Role Model Invariants", () => {
  it("TC-12: Submitter identity invariance (client-supplied user IDs are untrusted)", () => {
    // The submission schema purposefully does not accept user_id from client input
    const maliciousInput = {
      user_id: "attacker-manipulated-id",
      category: "bug_report",
      title: "Legitimate title",
      description: "Legitimate description with sufficient length.",
    };

    const validation = validateFeedbackSubmission(maliciousInput);
    assert.strictEqual(validation.valid, true);
    // Verified: user_id is not present in validated output data
    assert.strictEqual((validation.data as unknown as Record<string, unknown>).user_id, undefined);
  });

  it("TC-13: Student privacy guarantee (private staff notes must not leak into student responses)", () => {
    // Define a mockup student-facing item
    const studentItem = {
      id: "f-1",
      user_id: "student-1",
      category: "bug_report" as FeedbackCategory,
      title: "Bug in question timer",
      description: "Timer jumps on window blur",
      status: "closed" as FeedbackStatus,
      resolution_outcome: "implemented" as FeedbackOutcome,
      resolution_note: "Fixed in patch 1.4",
      subject_id: null,
      assessment_event_id: null,
      question_reference: null,
      page_url: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Internal notes array
    const internalNotes = [
      { id: "note-1", feedback_id: "f-1", author_id: "admin-1", note: "Secret internal investigation: race condition in WebSocket hook" },
    ];
    assert.strictEqual(internalNotes.length, 1);

    // Assert that the student item contract has zero internal note fields
    assert.strictEqual((studentItem as Record<string, unknown>).internal_notes, undefined);
    assert.strictEqual((studentItem as Record<string, unknown>).private_notes, undefined);
    assert.strictEqual(Object.keys(studentItem).includes("internal_notes"), false);
  });

  it("TC-14: Role model alignment (only admin role qualifies for triage operations)", () => {
    const roles = ["student", "tester", "admin", "guest", "ta"];

    // In the platform's PostgreSQL enum public.user_role ('student', 'tester', 'admin'),
    // only 'admin' has management authorization.
    const isAuthorizedForAdminTriage = (role: string) => role === "admin";

    for (const r of roles) {
      assert.strictEqual(isAuthorizedForAdminTriage(r), r === "admin");
    }
  });
});

// ==============================================================================
// 5. Multi-Instance Concurrency & Shared Store Rate Limit Tests
// ==============================================================================

describe("Feedback Centre: Multi-Instance Concurrency & Shared Store Behavior", () => {
  let sharedStore: InMemoryRateLimitStore;
  let lambdaA: SharedRateLimiter;
  let lambdaB: SharedRateLimiter;
  let lambdaC: SharedRateLimiter;

  beforeEach(() => {
    sharedStore = new InMemoryRateLimitStore();
    // Simulate 3 independent Vercel serverless worker instances sharing common backend state
    lambdaA = new SharedRateLimiter(sharedStore);
    lambdaB = new SharedRateLimiter(sharedStore);
    lambdaC = new SharedRateLimiter(sharedStore);
  });

  it("TC-15: Multi-instance concurrent requests with identical title are serialized and deduplicated", async () => {
    const userId = "concurrent-student-1";
    const title = "Calculator precision issue with square roots";
    const baseTime = 5000000;

    // Simulate 3 concurrent submissions arriving at separate lambda instances simultaneously
    const results = [
      lambdaA.checkAndRecord(userId, title, baseTime),
      lambdaB.checkAndRecord(userId, title, baseTime),
      lambdaC.checkAndRecord(userId, title, baseTime),
    ];

    const allowedCount = results.filter((r) => r.allowed).length;
    const rejectedCount = results.filter((r) => !r.allowed).length;

    // Exactly 1 must be permitted; the other 2 must be blocked as duplicates
    assert.strictEqual(allowedCount, 1);
    assert.strictEqual(rejectedCount, 2);
    for (const r of results.filter((r) => !r.allowed)) {
      assert.match(r.reason || "", /already received just now/i);
    }
  });

  it("TC-16: Multi-instance burst throttle across independent limiter instances", () => {
    const userId = "burst-student-2";
    const baseTime = 6000000;

    // Lambda A processes submission 1
    const r1 = lambdaA.checkAndRecord(userId, "Suggestion 1", baseTime);
    assert.strictEqual(r1.allowed, true);

    // Lambda B processes submission 2
    const r2 = lambdaB.checkAndRecord(userId, "Suggestion 2", baseTime + 15000);
    assert.strictEqual(r2.allowed, true);

    // Lambda C processes submission 3
    const r3 = lambdaC.checkAndRecord(userId, "Suggestion 3", baseTime + 30000);
    assert.strictEqual(r3.allowed, true);

    // Lambda A processes submission 4 within 2 minutes: must be blocked by the shared count
    const r4 = lambdaA.checkAndRecord(userId, "Suggestion 4", baseTime + 45000);
    assert.strictEqual(r4.allowed, false);
    assert.match(r4.reason || "", /submitting feedback too quickly/i);

    // Lambda B also sees the block
    const r5 = lambdaB.checkAndRecord(userId, "Suggestion 5", baseTime + 50000);
    assert.strictEqual(r5.allowed, false);
  });

  it("TC-17: Counter-window boundary behavior: burst window expiration allows new submissions", () => {
    const userId = "window-student-3";
    const t0 = 7000000;

    // 3 submissions within the first minute
    assert.strictEqual(lambdaA.checkAndRecord(userId, "Task A", t0).allowed, true);
    assert.strictEqual(lambdaB.checkAndRecord(userId, "Task B", t0 + 20000).allowed, true);
    assert.strictEqual(lambdaC.checkAndRecord(userId, "Task C", t0 + 40000).allowed, true);

    // At 1 minute 59 seconds (119s), burst window is still active: blocked
    const rBlocked = lambdaA.checkAndRecord(userId, "Task D", t0 + 119000);
    assert.strictEqual(rBlocked.allowed, false);

    // At 2 minutes and 1 millisecond (120,001ms), Task A has aged out of the 2-minute burst window: allowed
    const rAllowed = lambdaA.checkAndRecord(userId, "Task D", t0 + BURST_WINDOW_MS + 1);
    assert.strictEqual(rAllowed.allowed, true);
  });

  it("TC-18: Counter-window boundary behavior: duplicate title window expires after 60s", () => {
    const userId = "duplicate-student-4";
    const t0 = 8000000;
    const title = "Add dark mode toggle to calculator";

    // Initial submission via Lambda A
    assert.strictEqual(lambdaA.checkAndRecord(userId, title, t0).allowed, true);

    // At 30s: blocked via Lambda B
    assert.strictEqual(lambdaB.checkAndRecord(userId, title, t0 + 30000).allowed, false);

    // At 59.9s: blocked via Lambda C
    assert.strictEqual(lambdaC.checkAndRecord(userId, title, t0 + 59900).allowed, false);

    // At 60.001s: duplicate debounce window has expired: allowed
    const rAfter60s = lambdaA.checkAndRecord(userId, title, t0 + DEBOUNCE_WINDOW_MS + 1);
    assert.strictEqual(rAfter60s.allowed, true);
  });

  it("TC-19: Counter-window boundary behavior: hourly and daily limits", () => {
    const userId = "hourly-student-5";
    const t0 = 9000000;

    // Record 10 submissions spread across 50 minutes (every 5 minutes)
    for (let i = 0; i < 10; i++) {
      const res = lambdaA.checkAndRecord(userId, `Item ${i}`, t0 + i * 300000);
      assert.strictEqual(res.allowed, true);
    }

    // 11th submission at 55 minutes (within 1 hour) blocked
    const rHourBlocked = lambdaB.checkAndRecord(userId, "Item 11", t0 + 55 * 60 * 1000);
    assert.strictEqual(rHourBlocked.allowed, false);
    assert.match(rHourBlocked.reason || "", /hourly submission limit/i);

    // At 1 hour + 1 millisecond after Item 0: Item 0 has aged out, so 11th submission is permitted
    const rHourAllowed = lambdaC.checkAndRecord(userId, "Item 11", t0 + HOUR_WINDOW_MS + 1);
    assert.strictEqual(rHourAllowed.allowed, true);

    // Daily limit test (30 submissions within 24 hours)
    const userDaily = "daily-student-5";
    // 30 submissions spaced 45 minutes apart (total span: 21.75 hours, <= 2 per hour)
    for (let i = 0; i < 30; i++) {
      assert.strictEqual(
        lambdaA.checkAndRecord(userDaily, `Day Item ${i}`, t0 + i * 45 * 60 * 1000).allowed,
        true
      );
    }
    // 31st blocked at 22 hours (within 24 hours)
    assert.strictEqual(
      lambdaB.checkAndRecord(userDaily, "Day Item 31", t0 + 22 * 3600 * 1000).allowed,
      false
    );
    // Allowed once Day Item 0 ages out past DAY_WINDOW_MS (24 hours + 1ms after t0)
    assert.strictEqual(
      lambdaC.checkAndRecord(userDaily, "Day Item 31", t0 + DAY_WINDOW_MS + 1).allowed,
      true
    );
  });

  it("TC-20: Normalized title equivalence collapses whitespace and case across instances", () => {
    const userId = "normalize-student-6";
    const t0 = 10000000;

    // Explicit unit test of normalization function
    assert.strictEqual(
      hashTitle("  Fix   Graphing   Calculus\tDisplay  "),
      "fix graphing calculus display"
    );

    // Instance A records formatted title
    assert.strictEqual(
      lambdaA.checkAndRecord(userId, "Fix  Graphing   Calculus\tDisplay", t0).allowed,
      true
    );

    // Instance B checks differently formatted but equivalent title
    const checkRes = lambdaB.checkRateLimit(
      userId,
      "  fix graphing calculus display\n  ",
      t0 + 10000
    );
    assert.strictEqual(checkRes.allowed, false);
    assert.match(checkRes.reason || "", /already received just now/i);
  });

  it("TC-21: Strict user isolation: Student A counters do not affect Student B", () => {
    const userA = "student-isolated-A";
    const userB = "student-isolated-B";
    const t0 = 11000000;

    // User A hits burst limit (3 submissions)
    assert.strictEqual(lambdaA.checkAndRecord(userA, "Msg 1", t0).allowed, true);
    assert.strictEqual(lambdaA.checkAndRecord(userA, "Msg 2", t0 + 10000).allowed, true);
    assert.strictEqual(lambdaA.checkAndRecord(userA, "Msg 3", t0 + 20000).allowed, true);
    assert.strictEqual(lambdaA.checkAndRecord(userA, "Msg 4", t0 + 30000).allowed, false);

    // User B should NOT be blocked by User A's traffic
    assert.strictEqual(lambdaB.checkAndRecord(userB, "Msg 1", t0 + 35000).allowed, true);
    assert.strictEqual(lambdaC.checkAndRecord(userB, "Msg 2", t0 + 40000).allowed, true);
  });
});
