import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper simulations representing legacy attempt route resolution logic
interface MockAttempt {
  id: string;
  student_id: string;
  status: "Live" | "Completed" | "Submitted";
  start_time: string;
  assessment_subject_id: string;
  assessmentId: string;
  assignment_type: "TEST" | "PRODUCTION";
  test_duration_mins?: number | null;
}

interface AttemptResolutionOutcome {
  action: "not_found" | "redirect_login" | "redirect_review" | "redirect_completed" | "redirect_failed_finalize" | "redirect_exam";
  destinationUrl?: string;
  finalizedAttemptIds?: string[];
  expirationTimeMs?: number;
}

function resolveLegacyAttempt({
  user,
  attempt,
  allSessionLiveAttempts,
  reviewAllowed,
  finalizeRpcSuccess,
  currentTimeMs,
}: {
  user: { id: string } | null;
  attempt: MockAttempt | null;
  allSessionLiveAttempts?: MockAttempt[];
  reviewAllowed?: boolean;
  finalizeRpcSuccess?: boolean;
  currentTimeMs?: number;
}): AttemptResolutionOutcome {
  if (!user) {
    return { action: "redirect_login", destinationUrl: "/login" };
  }

  if (!attempt || attempt.student_id !== user.id) {
    return { action: "not_found" };
  }

  const assessmentId = attempt.assessmentId;

  // Completed / non-live attempts: route to review or completed details, never restart
  if (attempt.status !== "Live") {
    if (reviewAllowed) {
      return {
        action: "redirect_review",
        destinationUrl: `/student/results/review/${attempt.id}`,
      };
    }
    return {
      action: "redirect_completed",
      destinationUrl: `/student/assessment/${assessmentId}?completed=true`,
    };
  }

  // Live attempts: calculate authoritative timer
  const attemptsToConsider =
    allSessionLiveAttempts && allSessionLiveAttempts.length > 0
      ? allSessionLiveAttempts
      : [attempt];

  const startTimes = attemptsToConsider.map((a) => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);

  const isTest = attempt.assignment_type === "TEST";
  let totalDurationMins: number;
  if (isTest && attempt.test_duration_mins && attempt.test_duration_mins > 0) {
    totalDurationMins = attempt.test_duration_mins;
  } else {
    totalDurationMins = Math.max(90, attemptsToConsider.length * 60);
  }

  const totalDurationMs = totalDurationMins * 60 * 1000;
  const expirationTimeMs = authoritativeStartTimeMs + totalDurationMs;
  const now = currentTimeMs ?? Date.now();

  // Expired attempts: finalize and route to completed
  if (now > expirationTimeMs) {
    if (finalizeRpcSuccess === false) {
      return {
        action: "redirect_failed_finalize",
        destinationUrl: `/student/assessment/${assessmentId}?error=failed_to_finalize`,
        finalizedAttemptIds: attemptsToConsider.map((a) => a.id),
      };
    }
    return {
      action: "redirect_completed",
      destinationUrl: `/student/assessment/${assessmentId}?completed=true`,
      finalizedAttemptIds: attemptsToConsider.map((a) => a.id),
    };
  }

  // Active attempt: canonical redirection without timer reset
  return {
    action: "redirect_exam",
    destinationUrl: `/student/assessment/${assessmentId}/exam`,
    expirationTimeMs,
  };
}

// Helper simulations representing asset authorization policy
interface MockUser {
  id: string;
  email?: string;
  role: "admin" | "student" | "tester" | "unknown";
}

interface MockAssetRequest {
  storagePath: string;
  user: MockUser | null;
  activeSession?: {
    studentId: string;
    assessmentId: string;
    assignmentType: "TEST" | "PRODUCTION";
    testAccessMode?: "TESTER_ONLY" | "ENROLLED_ONLY";
    paperStoragePaths: string[];
  } | null;
  userAttempts?: Array<{
    assessmentId: string;
    assignmentType: "TEST" | "PRODUCTION";
    paperStoragePaths: string[];
  }>;
}

function authorizeAssetRequest(req: MockAssetRequest): { allowed: boolean; status: number; reason?: string } {
  if (!req.user) {
    return { allowed: false, status: 401, reason: "Authentication required" };
  }

  const { role, email } = req.user;

  if (role === "admin") {
    return { allowed: true, status: 200 };
  }

  if (role === "student") {
    // Scaler domain verification
    if (!email || !email.toLowerCase().endsWith("@sst.scaler.com")) {
      return { allowed: false, status: 403, reason: "Restricted to official Scaler accounts" };
    }

    // Active session check
    if (req.activeSession && req.activeSession.studentId === req.user.id) {
      if (req.activeSession.paperStoragePaths.includes(req.storagePath)) {
        return { allowed: true, status: 200 };
      }
    }

    // Attempt / RPC fallback for student
    if (req.userAttempts) {
      for (const att of req.userAttempts) {
        if (att.paperStoragePaths.includes(req.storagePath)) {
          return { allowed: true, status: 200 };
        }
      }
    }

    return { allowed: false, status: 403, reason: "Access restricted" };
  }

  if (role === "tester") {
    // Active session check strictly for TEST assignments
    if (req.activeSession && req.activeSession.studentId === req.user.id) {
      if (req.activeSession.assignmentType === "TEST") {
        if (req.activeSession.paperStoragePaths.includes(req.storagePath)) {
          return { allowed: true, status: 200 };
        }
      }
      // If activeSession is PRODUCTION, tester is denied
    }

    // Fallback: attempts check strictly for TEST assignments
    if (req.userAttempts) {
      for (const att of req.userAttempts) {
        if (att.assignmentType === "TEST" && att.paperStoragePaths.includes(req.storagePath)) {
          return { allowed: true, status: 200 };
        }
      }
    }

    return { allowed: false, status: 403, reason: "Access restricted" };
  }

  return { allowed: false, status: 403, reason: "Invalid user role" };
}

describe("Legacy Exam Route & Tester Asset Access Stabilization", () => {
  // --------------------------------------------------------------------------
  // Legacy Exam Route Resolution
  // --------------------------------------------------------------------------
  it("TC-1: Unauthorized attempt access (student ID mismatch or missing) returns notFound", () => {
    const studentA = { id: "student-111" };
    const foreignAttempt: MockAttempt = {
      id: "attempt-abc",
      student_id: "student-999",
      status: "Live",
      start_time: new Date().toISOString(),
      assessment_subject_id: "asub-1",
      assessmentId: "event-1",
      assignment_type: "PRODUCTION",
    };

    const result = resolveLegacyAttempt({
      user: studentA,
      attempt: foreignAttempt,
    });

    assert.strictEqual(result.action, "not_found");
  });

  it("TC-2: Completed attempts route to review if permitted, or assessment details, and never restart", () => {
    const student = { id: "student-111" };
    const completedAttempt: MockAttempt = {
      id: "attempt-completed-1",
      student_id: "student-111",
      status: "Completed",
      start_time: "2026-10-12T10:00:00Z",
      assessment_subject_id: "asub-1",
      assessmentId: "event-1",
      assignment_type: "PRODUCTION",
    };

    // When review is permitted
    const resWithReview = resolveLegacyAttempt({
      user: student,
      attempt: completedAttempt,
      reviewAllowed: true,
    });
    assert.strictEqual(resWithReview.action, "redirect_review");
    assert.strictEqual(resWithReview.destinationUrl, "/student/results/review/attempt-completed-1");

    // When review is locked/unavailable
    const resNoReview = resolveLegacyAttempt({
      user: student,
      attempt: completedAttempt,
      reviewAllowed: false,
    });
    assert.strictEqual(resNoReview.action, "redirect_completed");
    assert.strictEqual(resNoReview.destinationUrl, "/student/assessment/event-1?completed=true");
  });

  it("TC-3: Active legacy attempt resumes with authoritative deadline without timer reset", () => {
    const student = { id: "student-111" };
    const baseStartTime = new Date("2026-10-12T12:00:00Z").getTime();
    const liveAttempt: MockAttempt = {
      id: "attempt-live-1",
      student_id: "student-111",
      status: "Live",
      start_time: new Date(baseStartTime).toISOString(),
      assessment_subject_id: "asub-1",
      assessmentId: "event-production-1",
      assignment_type: "PRODUCTION",
    };

    // 30 minutes elapsed (well within 90 minutes)
    const currentTimeMs = baseStartTime + 30 * 60 * 1000;
    const result = resolveLegacyAttempt({
      user: student,
      attempt: liveAttempt,
      currentTimeMs,
    });

    assert.strictEqual(result.action, "redirect_exam");
    assert.strictEqual(result.destinationUrl, "/student/assessment/event-production-1/exam");
    // Authoritative deadline must remain exact start + 90 mins, not reset to current + 90 mins
    const expectedExpiration = baseStartTime + 90 * 60 * 1000;
    assert.strictEqual(result.expirationTimeMs, expectedExpiration);
  });

  it("TC-4: Expired legacy attempt triggers finalization and routes to completed status", () => {
    const student = { id: "student-111" };
    const baseStartTime = new Date("2026-10-12T10:00:00Z").getTime();
    const expiredAttempt: MockAttempt = {
      id: "attempt-expired-1",
      student_id: "student-111",
      status: "Live",
      start_time: new Date(baseStartTime).toISOString(),
      assessment_subject_id: "asub-1",
      assessmentId: "event-1",
      assignment_type: "PRODUCTION",
    };

    // 100 minutes elapsed (> 90 mins duration)
    const currentTimeMs = baseStartTime + 100 * 60 * 1000;
    const result = resolveLegacyAttempt({
      user: student,
      attempt: expiredAttempt,
      finalizeRpcSuccess: true,
      currentTimeMs,
    });

    assert.strictEqual(result.action, "redirect_completed");
    assert.strictEqual(result.destinationUrl, "/student/assessment/event-1?completed=true");
    assert.deepStrictEqual(result.finalizedAttemptIds, ["attempt-expired-1"]);
  });

  it("TC-5: Expired legacy attempt surfaces error parameter if finalization fails", () => {
    const student = { id: "student-111" };
    const baseStartTime = new Date("2026-10-12T10:00:00Z").getTime();
    const expiredAttempt: MockAttempt = {
      id: "attempt-expired-2",
      student_id: "student-111",
      status: "Live",
      start_time: new Date(baseStartTime).toISOString(),
      assessment_subject_id: "asub-1",
      assessmentId: "event-1",
      assignment_type: "PRODUCTION",
    };

    const currentTimeMs = baseStartTime + 100 * 60 * 1000;
    const result = resolveLegacyAttempt({
      user: student,
      attempt: expiredAttempt,
      finalizeRpcSuccess: false,
      currentTimeMs,
    });

    assert.strictEqual(result.action, "redirect_failed_finalize");
    assert.strictEqual(result.destinationUrl, "/student/assessment/event-1?error=failed_to_finalize");
  });

  // --------------------------------------------------------------------------
  // Asset Route & Tester Authorization
  // --------------------------------------------------------------------------
  it("TC-6: Unauthenticated asset requests are rejected with 401 Unauthorized", () => {
    const result = authorizeAssetRequest({
      storagePath: "papers/july16_q1.png",
      user: null,
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.status, 401);
  });

  it("TC-7: Admin role is authorized for question assets", () => {
    const result = authorizeAssetRequest({
      storagePath: "papers/july16_q1.png",
      user: { id: "admin-1", email: "admin@institute.edu", role: "admin" },
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.status, 200);
  });

  it("TC-8: Student with non-Scaler email is denied with 403 Forbidden", () => {
    const result = authorizeAssetRequest({
      storagePath: "papers/july16_q1.png",
      user: { id: "student-1", email: "student@gmail.com", role: "student" },
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.status, 403);
  });

  it("TC-9: Authorized tester is permitted to access images for an eligible TEST assessment", () => {
    const testerUser: MockUser = {
      id: "tester-101",
      email: "tester@sst.scaler.com",
      role: "tester",
    };

    const result = authorizeAssetRequest({
      storagePath: "papers/test_sample_q1.png",
      user: testerUser,
      activeSession: {
        studentId: "tester-101",
        assessmentId: "test-event-42",
        assignmentType: "TEST",
        testAccessMode: "TESTER_ONLY",
        paperStoragePaths: ["papers/test_sample_q1.png"],
      },
    });

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.status, 200);
  });

  it("TC-10: Tester is STRICTLY DENIED access to PRODUCTION exam assets", () => {
    const testerUser: MockUser = {
      id: "tester-101",
      email: "tester@sst.scaler.com",
      role: "tester",
    };

    // Attempting to access an asset belonging to a PRODUCTION exam
    const result = authorizeAssetRequest({
      storagePath: "papers/prod_exam_q5.png",
      user: testerUser,
      activeSession: {
        studentId: "tester-101",
        assessmentId: "prod-event-99",
        assignmentType: "PRODUCTION",
        paperStoragePaths: ["papers/prod_exam_q5.png"],
      },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.status, 403);
  });

  it("TC-11: Unknown or unpermitted roles are rejected with 403 Forbidden", () => {
    const result = authorizeAssetRequest({
      storagePath: "papers/test_sample_q1.png",
      user: { id: "user-unknown", role: "unknown" },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.status, 403);
  });
});
