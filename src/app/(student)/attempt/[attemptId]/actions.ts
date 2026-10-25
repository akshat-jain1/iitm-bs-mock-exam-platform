"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { IntegrityEventType } from "@/lib/exam-integrity/config";
import { SAVE_GRACE_MS, type ActionResult, type PendingExamResponse } from "@/lib/exam/constants";

export async function saveResponseAction(
  attemptId: string,
  questionVersionId: string,
  data: unknown,
  markedForReview: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (!claims?.sub) {
      return { success: false, code: "UNAUTHORIZED", message: "User is not authenticated" };
    }

    const userId = claims.sub as string;

    // 1. Authoritative timing depends on the signed exam_session cookie
    const cookieStore = await cookies();
    const secret = process.env.EXAM_SESSION_SECRET;
    if (!secret) {
      return { success: false, code: "TRANSIENT", message: "Server configuration error: EXAM_SESSION_SECRET is not set" };
    }

    const sessionCookies = cookieStore.getAll().filter(c => c.name.startsWith("exam_session_"));
    if (sessionCookies.length === 0) {
      return { success: false, code: "UNAUTHORIZED", message: "No active exam session cookie found" };
    }

    let matchingSession: {
      assessmentId: string;
      studentId: string;
      attempts: string;
      startMs?: number;
      durationMs?: number;
    } | null = null;

    let hasValidSig = false;
    let userMatched = false;

    for (const cookie of sessionCookies) {
      try {
        const { payload, signature } = JSON.parse(cookie.value);
        const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
        if (signature !== expectedSig) continue;
        hasValidSig = true;

        const sessionData = JSON.parse(payload);
        if (sessionData.studentId !== userId) continue;
        userMatched = true;

        const validAttemptIds: string[] = sessionData.attempts ? sessionData.attempts.split(",") : [];
        if (validAttemptIds.includes(attemptId)) {
          matchingSession = sessionData;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!hasValidSig) {
      return { success: false, code: "UNAUTHORIZED", message: "Invalid exam session signature" };
    }
    if (!userMatched) {
      return { success: false, code: "UNAUTHORIZED", message: "Session does not belong to the current user" };
    }
    if (!matchingSession) {
      return { success: false, code: "UNAUTHORIZED", message: "Attempt is not authorized in the current session" };
    }

    // 2. Authoritative timing check with SAVE_GRACE_MS: cookie-based (0 DB query) or legacy DB-fallback
    if (typeof matchingSession.startMs === "number" && typeof matchingSession.durationMs === "number") {
      const elapsedMs = Date.now() - matchingSession.startMs;
      if (elapsedMs >= matchingSession.durationMs + SAVE_GRACE_MS) {
        return { success: false, code: "EXPIRED", message: "Exam has expired. Responses can no longer be saved." };
      }
    } else {
      // Fallback for legacy cookie issued before Phase 5a
      const validAttemptIds: string[] = matchingSession.attempts.split(",");
      const { data: authorizedAttempts } = await supabase
        .from("attempts")
        .select(`id, start_time, assessment_subjects!inner(assessment_event_id)`)
        .in("id", validAttemptIds)
        .eq("student_id", userId)
        .eq("status", "Live")
        .eq("assessment_subjects.assessment_event_id", matchingSession.assessmentId);

      if (!authorizedAttempts || authorizedAttempts.length === 0) {
        return { success: false, code: "UNAUTHORIZED", message: "No authorized live attempts found" };
      }

      const subjectCount = authorizedAttempts.length;
      const startTimes = authorizedAttempts.map(a => new Date(a.start_time).getTime());
      const authoritativeStartTimeMs = Math.min(...startTimes);
      const totalDurationMins = Math.max(90, subjectCount * 60);
      const totalDurationMs = totalDurationMins * 60 * 1000;

      const elapsedMs = Date.now() - authoritativeStartTimeMs;
      if (elapsedMs >= totalDurationMs + SAVE_GRACE_MS) {
        return { success: false, code: "EXPIRED", message: "Exam has expired. Responses can no longer be saved." };
      }
    }

    // 3. Atomically validate payload and save response via service role RPC
    const serviceClient = getServiceClient();
    const { error } = await serviceClient.rpc("save_response", {
      p_student_id: userId,
      p_attempt_id: attemptId,
      p_question_version_id: questionVersionId,
      p_data: data === undefined ? null : data,
      p_marked: markedForReview,
    });

    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("expired")) {
        return { success: false, code: "EXPIRED", message: "Exam time has expired" };
      }
      if (lower.includes("unauthorized") || lower.includes("not live") || lower.includes("does not belong")) {
        return { success: false, code: "UNAUTHORIZED", message: error.message };
      }
      if (
        lower.includes("invalid") ||
        lower.includes("duplicate") ||
        lower.includes("unsupported") ||
        lower.includes("not found") ||
        lower.includes("does not exist") ||
        lower.includes("do not exist")
      ) {
        return { success: false, code: "INVALID", message: error.message };
      }
      return { success: false, code: "TRANSIENT", message: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      code: "TRANSIENT",
      message: err instanceof Error ? err.message : "Failed to save response",
    };
  }
}

export async function submitAttemptAction(attemptId: string) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    throw new Error("Unauthorized");
  }

  const user = { id: claims.sub as string, email: claims.email as string | undefined };

  const { data: attempt } = await supabase
    .from("attempts")
    .select(`
      student_id, 
      status, 
      start_time,
      assessment_subjects!inner(assessment_event_id)
    `)
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.student_id !== user.id) {
    throw new Error("Unauthorized or invalid attempt");
  }

  if (attempt.status !== "Live") {
    throw new Error("Attempt is not Live");
  }

  const eventId = (attempt.assessment_subjects as unknown as { assessment_event_id: string }).assessment_event_id;

  // 1. Authoritative timing depends on the signed exam_session cookie
  const cookieStore = await cookies();
  const sessionCookieStr = cookieStore.get(`exam_session_${eventId}`)?.value;
  
  if (!sessionCookieStr) {
    throw new Error("No active exam session cookie found");
  }

  const { payload, signature } = JSON.parse(sessionCookieStr);
  const secret = process.env.EXAM_SESSION_SECRET;
  if (!secret) throw new Error("Server configuration error: EXAM_SESSION_SECRET is not set");
  
  const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
  if (signature !== expectedSig) {
    throw new Error("Invalid exam session signature");
  }

  const sessionData = JSON.parse(payload);
  
  if (sessionData.studentId !== user.id) {
    throw new Error("Session does not belong to the current user");
  }
  if (sessionData.assessmentId !== eventId) {
    throw new Error("Session does not match the assessment event");
  }

  const validAttemptIds: string[] = sessionData.attempts.split(',');

  if (!validAttemptIds.includes(attemptId)) {
    throw new Error("Attempt is not authorized in the current session");
  }

  // 2. Independently query those exact authorized attempt IDs
  const { data: authorizedAttempts } = await supabase
    .from("attempts")
    .select(`id, start_time, assessment_subjects!inner(assessment_event_id)`)
    .in("id", validAttemptIds)
    .eq("student_id", user.id)
    .eq("status", "Live")
    .eq("assessment_subjects.assessment_event_id", eventId);

  if (!authorizedAttempts || authorizedAttempts.length === 0) {
    throw new Error("No authorized live attempts found");
  }

  const subjectCount = authorizedAttempts.length;
  // Calculate correct duration
  const startTimes = authorizedAttempts.map(a => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);
  
  const totalDurationMins = Math.max(90, subjectCount * 60);
  const totalDurationMs = totalDurationMins * 60 * 1000;

  const elapsedMs = Date.now() - authoritativeStartTimeMs;
  if (elapsedMs < totalDurationMs) {
    throw new Error(`Cannot submit exam before exactly ${totalDurationMins} minutes have elapsed`);
  }

  // Finalize attempt and evaluate using service role (atomically)
  const serviceClient = getServiceClient();

  const { error } = await serviceClient.rpc('evaluate_and_finalize_attempt', {
    p_attempt_id: attemptId
  });

  if (error) throw error;

  return { success: true };
}

export async function logIntegrityEventAction(
  attemptId: string,
  eventType: IntegrityEventType,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const validEvents: IntegrityEventType[] = [
      "fullscreen_exit",
      "fullscreen_enter",
      "visibility_lost",
      "visibility_restored",
      "window_blur",
      "window_focus",
      "copy_attempt",
      "paste_attempt",
      "cut_attempt",
      "context_menu_attempt",
      "restricted_shortcut_attempt",
    ];

    if (!validEvents.includes(eventType)) {
      return { success: false, error: "Invalid event type" };
    }

    if (metadata && JSON.stringify(metadata).length > 4096) {
      return { success: false, error: "Metadata payload exceeds size limit" };
    }

    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (!claims?.sub) {
      return { success: false, error: "Unauthorized" };
    }

    const userId = claims.sub as string;

    // Verify HMAC signed exam session
    const cookieStore = await cookies();
    const secret = process.env.EXAM_SESSION_SECRET;
    if (!secret) {
      return { success: false, error: "EXAM_SESSION_SECRET is not set" };
    }

    const sessionCookies = cookieStore.getAll().filter(c => c.name.startsWith("exam_session_"));
    if (sessionCookies.length === 0) {
      return { success: false, error: "No active exam session cookie found" };
    }

    let matchingSession: {
      assessmentId: string;
      studentId: string;
      attempts: string;
      startMs?: number;
      durationMs?: number;
    } | null = null;

    let hasValidSig = false;
    let userMatched = false;

    for (const cookie of sessionCookies) {
      try {
        const { payload, signature } = JSON.parse(cookie.value);
        const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
        if (signature !== expectedSig) continue;
        hasValidSig = true;

        const sessionData = JSON.parse(payload);
        if (sessionData.studentId !== userId) continue;
        userMatched = true;

        const validAttemptIds: string[] = sessionData.attempts ? sessionData.attempts.split(",") : [];
        if (validAttemptIds.includes(attemptId)) {
          matchingSession = sessionData;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!hasValidSig) {
      return { success: false, error: "Invalid exam session signature" };
    }
    if (!userMatched) {
      return { success: false, error: "Exam session mismatch" };
    }
    if (!matchingSession) {
      return { success: false, error: "Attempt not authorized in session" };
    }

    // Expiry check: cookie-based (0 DB query) or legacy DB-fallback
    if (typeof matchingSession.startMs === "number" && typeof matchingSession.durationMs === "number") {
      const elapsedMs = Date.now() - matchingSession.startMs;
      if (elapsedMs >= matchingSession.durationMs) {
        return { success: false, error: "Exam has expired" };
      }
    } else {
      // Fallback for legacy cookie issued before Phase 5a
      const validAttemptIds: string[] = matchingSession.attempts.split(",");
      const { data: authorizedAttempts } = await supabase
        .from("attempts")
        .select(`id, start_time, assessment_subjects!inner(assessment_event_id)`)
        .in("id", validAttemptIds)
        .eq("student_id", userId)
        .eq("status", "Live")
        .eq("assessment_subjects.assessment_event_id", matchingSession.assessmentId);

      if (!authorizedAttempts || authorizedAttempts.length === 0) {
        return { success: false, error: "No authorized live attempts found" };
      }

      const subjectCount = authorizedAttempts.length;
      const startTimes = authorizedAttempts.map(a => new Date(a.start_time).getTime());
      const authoritativeStartTimeMs = Math.min(...startTimes);
      const totalDurationMins = Math.max(90, subjectCount * 60);
      const totalDurationMs = totalDurationMins * 60 * 1000;
      const elapsedMs = Date.now() - authoritativeStartTimeMs;
      if (elapsedMs >= totalDurationMs) {
        return { success: false, error: "Exam has expired" };
      }
    }

    // Insert into exam_integrity_events via RLS (attempts-status lookup safely dropped)
    const { error: insertError } = await supabase
      .from("exam_integrity_events")
      .insert({
        attempt_id: attemptId,
        student_id: userId,
        event_type: eventType,
        metadata: metadata || {},
      });

    if (insertError) {
      console.error("Error inserting integrity event:", insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("logIntegrityEventAction caught error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function finalizeAttemptsAction(
  attemptIds: string[],
  pendingResponses: PendingExamResponse[] = []
): Promise<ActionResult<{ finalized_count: number; skipped_count: number }>> {
  try {
    if (!Array.isArray(attemptIds) || attemptIds.length === 0 || attemptIds.length > 10 || new Set(attemptIds).size !== attemptIds.length) {
      return { success: false, code: "INVALID", message: "No attempts provided to finalize" };
    }
    if (!Array.isArray(pendingResponses) || pendingResponses.length > 500 || pendingResponses.some(
      response => !response || !attemptIds.includes(response.attemptId) || typeof response.questionId !== "string" || typeof response.markedForReview !== "boolean"
    )) {
      return { success: false, code: "INVALID", message: "Invalid pending responses" };
    }

    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (!claims?.sub) {
      return { success: false, code: "UNAUTHORIZED", message: "User is not authenticated" };
    }

    const userId = claims.sub as string;

    const cookieStore = await cookies();
    const secret = process.env.EXAM_SESSION_SECRET;
    if (!secret) {
      return { success: false, code: "TRANSIENT", message: "Server configuration error: EXAM_SESSION_SECRET is not set" };
    }

    const sessionCookies = cookieStore.getAll().filter(c => c.name.startsWith("exam_session_"));
    if (sessionCookies.length === 0) {
      return { success: false, code: "UNAUTHORIZED", message: "No active exam session cookie found" };
    }

    let matchingSession: {
      assessmentId: string;
      studentId: string;
      attempts: string;
      startMs?: number;
      durationMs?: number;
    } | null = null;

    let hasValidSig = false;
    let userMatched = false;

    for (const cookie of sessionCookies) {
      try {
        const { payload, signature } = JSON.parse(cookie.value);
        const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
        if (signature !== expectedSig) continue;
        hasValidSig = true;

        const sessionData = JSON.parse(payload);
        if (sessionData.studentId !== userId) continue;
        userMatched = true;

        const validAttemptIds: string[] = sessionData.attempts ? sessionData.attempts.split(",") : [];
        const allIncluded = attemptIds.every(id => validAttemptIds.includes(id));
        if (allIncluded) {
          matchingSession = sessionData;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!hasValidSig) {
      return { success: false, code: "UNAUTHORIZED", message: "Invalid exam session signature" };
    }
    if (!userMatched) {
      return { success: false, code: "UNAUTHORIZED", message: "Session does not belong to the current user" };
    }
    if (!matchingSession) {
      return { success: false, code: "UNAUTHORIZED", message: "One or more attempts are not authorized in the current session" };
    }

    if (pendingResponses.length > 0) {
      if (typeof matchingSession.startMs !== "number" || typeof matchingSession.durationMs !== "number") {
        return { success: false, code: "INVALID", message: "Please reload the exam before submitting pending answers" };
      }
      if (Date.now() >= matchingSession.startMs + matchingSession.durationMs + SAVE_GRACE_MS) {
        return { success: false, code: "EXPIRED", message: "The answer saving window has expired" };
      }
    }

    // Authoritative duration rule: same as submitAttemptAction (NO grace period on finalize)
    // Check if the assessment is a TEST assignment before blocking early submission
    const { data: assessmentData } = await supabase
      .from("assessment_events")
      .select("assignment_type")
      .eq("id", matchingSession.assessmentId)
      .single();

    const isTestAssessment = assessmentData?.assignment_type === "TEST";

    if (!isTestAssessment) {
      if (typeof matchingSession.startMs === "number" && typeof matchingSession.durationMs === "number") {
        const elapsedMs = Date.now() - matchingSession.startMs;
        const totalDurationMins = Math.round(matchingSession.durationMs / (60 * 1000));
        if (elapsedMs < matchingSession.durationMs) {
          return {
            success: false,
            code: "INVALID",
            message: `Cannot submit exam before exactly ${totalDurationMins} minutes have elapsed`,
          };
        }
      } else {
        // Fallback for legacy cookie
        const validAttemptIds: string[] = matchingSession.attempts.split(",");
        const { data: authorizedAttempts } = await supabase
          .from("attempts")
          .select(`id, start_time, assessment_subjects!inner(assessment_event_id)`)
          .in("id", validAttemptIds)
          .eq("student_id", userId)
          .eq("status", "Live")
          .eq("assessment_subjects.assessment_event_id", matchingSession.assessmentId);

        if (!authorizedAttempts || authorizedAttempts.length === 0) {
          return { success: false, code: "UNAUTHORIZED", message: "No authorized live attempts found" };
        }

        const subjectCount = authorizedAttempts.length;
        const startTimes = authorizedAttempts.map(a => new Date(a.start_time).getTime());
        const authoritativeStartTimeMs = Math.min(...startTimes);
        const totalDurationMins = Math.max(90, subjectCount * 60);
        const totalDurationMs = totalDurationMins * 60 * 1000;

        const elapsedMs = Date.now() - authoritativeStartTimeMs;
        if (elapsedMs < totalDurationMs) {
          return {
            success: false,
            code: "INVALID",
            message: `Cannot submit exam before exactly ${totalDurationMins} minutes have elapsed`,
          };
        }
      }
    }

    // Atomically finalize all live attempts in one RPC transaction
    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient.rpc("finalize_attempts_with_responses", {
      p_student_id: userId,
      p_attempt_ids: attemptIds,
      p_responses: pendingResponses.map(response => ({
        attemptId: response.attemptId,
        questionId: response.questionId,
        payload: response.payload === undefined ? null : response.payload,
        markedForReview: response.markedForReview,
      })),
    });

    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("unauthorized") || lower.includes("not belong")) {
        return { success: false, code: "UNAUTHORIZED", message: error.message };
      }
      if (lower.includes("invalid")) {
        return { success: false, code: "INVALID", message: error.message };
      }
      return { success: false, code: "TRANSIENT", message: error.message };
    }

    return {
      success: true,
      result: data as { finalized_count: number; skipped_count: number },
    };
  } catch (err: unknown) {
    console.error("finalizeAttemptsAction caught error:", err);
    return {
      success: false,
      code: "TRANSIENT",
      message: err instanceof Error ? err.message : "Failed to finalize attempts",
    };
  }
}

export async function exitTestExamAction(
  assessmentId: string,
  attemptIds: string[]
): Promise<ActionResult<{ finalized_count: number; skipped_count: number }>> {
  try {
    if (!Array.isArray(attemptIds) || attemptIds.length === 0) {
      return { success: false, code: "INVALID", message: "No attempts provided to exit" };
    }

    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (!claims?.sub) {
      return { success: false, code: "UNAUTHORIZED", message: "User is not authenticated" };
    }

    const userId = claims.sub as string;

    const cookieStore = await cookies();
    const secret = process.env.EXAM_SESSION_SECRET;
    if (!secret) {
      return { success: false, code: "TRANSIENT", message: "Server configuration error: EXAM_SESSION_SECRET is not set" };
    }

    const sessionCookie = cookieStore.get(`exam_session_${assessmentId}`);
    if (!sessionCookie) {
      return { success: false, code: "UNAUTHORIZED", message: "No active exam session cookie found" };
    }

    let matchingSession: {
      assessmentId: string;
      studentId: string;
      attempts: string;
      isTest?: boolean;
    } | null = null;

    try {
      const { payload, signature } = JSON.parse(sessionCookie.value);
      const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
      if (signature !== expectedSig) {
        return { success: false, code: "UNAUTHORIZED", message: "Invalid exam session signature" };
      }
      const sessionData = JSON.parse(payload);
      if (sessionData.studentId !== userId || sessionData.assessmentId !== assessmentId) {
        return { success: false, code: "UNAUTHORIZED", message: "Session does not match current user or assessment" };
      }
      const validAttemptIds: string[] = sessionData.attempts ? sessionData.attempts.split(",") : [];
      const allIncluded = attemptIds.every(id => validAttemptIds.includes(id));
      if (!allIncluded) {
        return { success: false, code: "UNAUTHORIZED", message: "One or more attempts are not authorized in the session" };
      }
      matchingSession = sessionData;
    } catch {
      return { success: false, code: "UNAUTHORIZED", message: "Malformed exam session cookie" };
    }

    if (!matchingSession) {
      return { success: false, code: "UNAUTHORIZED", message: "Unauthorized exam session" };
    }

    // Authoritative check: verify from database that the assessment is a TEST assignment
    const { data: eventData, error: eventErr } = await supabase
      .from("assessment_events")
      .select("assignment_type")
      .eq("id", assessmentId)
      .single();

    if (eventErr || !eventData || eventData.assignment_type !== "TEST") {
      return { success: false, code: "INVALID", message: "Exit and Finish is only permitted for Test Assignments" };
    }

    // Atomically finalize all live test attempts in one RPC transaction
    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient.rpc("finalize_attempts", {
      p_student_id: userId,
      p_attempt_ids: attemptIds,
    });

    if (error) {
      console.error("finalize_attempts RPC returned error in exitTestExamAction:", error);
      return { success: false, code: "TRANSIENT", message: error.message || "Failed to finalize test attempts" };
    }

    return {
      success: true,
      result: data as { finalized_count: number; skipped_count: number },
    };
  } catch (err: unknown) {
    console.error("exitTestExamAction caught error:", err);
    return {
      success: false,
      code: "TRANSIENT",
      message: err instanceof Error ? err.message : "Internal server error",
    };
  }
}

