"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { isAllowedScalerEmail } from "@/lib/auth/config";

export async function startExamAction(assessmentId: string, assessmentSubjectIds: string[]) {
  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    throw new Error("Unauthorized");
  }

  const user = {
    id: claims.sub as string,
    email: claims.email as string | undefined,
  };

  // Scaler Domain Enforcement Guard
  if (!isAllowedScalerEmail(user.email)) {
    throw new Error("Access restricted: Official Scaler student account required.");
  }

  // The start_student_attempts RPC validates role, subject selection and enrollment atomically.
  const assessmentRes = await supabase.from("assessment_events")
    .select("id, status, assignment_type, test_duration_mins")
    .eq("id", assessmentId).single();
  const assessment = assessmentRes.data;
  if (assessmentRes.error || !assessment || assessment.status !== "Live") {
    throw new Error("Assessment is not Live or invalid");
  }

  const isTestAssessment = assessment.assignment_type === "TEST";

  // Resumption & Session Integrity Check:
  // Inspect existing Live attempts for this student in this assessment event.
  // If the student has active Live attempts, ensure the selection does not mix an existing Live
  // session with newly created attempts or with Live attempts from different sessions.
  const { data: existingLiveAttempts } = await queryClient
    .from("attempts")
    .select(`
      id,
      assessment_subject_id,
      start_time,
      assessment_subjects!inner (
        assessment_event_id
      )
    `)
    .eq("student_id", user.id)
    .eq("status", "Live")
    .eq("assessment_subjects.assessment_event_id", assessmentId);

  if (existingLiveAttempts && existingLiveAttempts.length > 0) {
    const startTimes = existingLiveAttempts.map(a => new Date(a.start_time).getTime());
    const authoritativeStartTimeMs = Math.min(...startTimes);
    let totalDurationMins: number;
    if (isTestAssessment && assessment.test_duration_mins && assessment.test_duration_mins > 0) {
      totalDurationMins = assessment.test_duration_mins;
    } else {
      totalDurationMins = Math.max(90, existingLiveAttempts.length * 60);
    }
    const totalDurationMs = totalDurationMins * 60 * 1000;
    const isExpired = Date.now() > (authoritativeStartTimeMs + totalDurationMs);

    if (isExpired) {
      // The previous live session has expired. Atomically finalize it before proceeding.
      const serviceClient = getServiceClientOrNull();
      if (serviceClient) {
        try {
          await serviceClient.rpc("finalize_attempts", {
            p_student_id: user.id,
            p_attempt_ids: existingLiveAttempts.map(a => a.id),
          });
        } catch (finalizeErr) {
          console.error("Failed to finalize expired live attempts in startExamAction:", finalizeErr);
        }
      }
      const cookieStore = await cookies();
      cookieStore.delete(`exam_session_${assessmentId}`);

      if (!isTestAssessment) {
        throw new Error("Your previous exam attempt has expired and been submitted. Retakes are not permitted.");
      }
      // For test assignments, the expired session is now Completed, allowing a fresh attempt to be started below.
    } else {
      const liveStartTimeSet = new Set(
        existingLiveAttempts.map(a => (a.start_time ? a.start_time.trim() : a.id))
      );

      if (liveStartTimeSet.size > 1) {
        throw new Error(
          "You have in-progress attempts from multiple test sessions. Please complete or exit them individually."
        );
      }

      const liveSubjectIds = new Set(existingLiveAttempts.map(a => a.assessment_subject_id));
      const selectedAreAllLive = assessmentSubjectIds.every(id => liveSubjectIds.has(id));
      const selectedAreNoneLive = assessmentSubjectIds.every(id => !liveSubjectIds.has(id));

      if (!selectedAreAllLive && !selectedAreNoneLive) {
        throw new Error(
          "Cannot combine an in-progress test session with new subjects. Please complete or exit your active test session first."
        );
      }

      if (selectedAreNoneLive) {
        throw new Error(
          "You already have an active test session in progress. Please resume and complete or exit that session before starting new subjects."
        );
      }
    }
  }

  // Authoritative Attempt Creation / Resumption via SECURITY DEFINER RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("start_student_attempts", {
    p_assessment_id: assessmentId,
    p_assessment_subject_ids: assessmentSubjectIds,
  });

  if (rpcError || !rpcData) {
    console.error("start_student_attempts RPC failed:", rpcError);
    throw new Error(rpcError?.message || "Failed to start assessment attempts");
  }

  const rpcResult = rpcData as {
    success: boolean;
    student_id: string;
    attempt_ids: string[];
    is_test: boolean;
  };

  const attemptIds = rpcResult.attempt_ids;
  if (!attemptIds || attemptIds.length === 0) {
    throw new Error("No attempt identifiers returned by server");
  }

  // Fetch authoritative attempt start times for duration calculation and session integrity
  const { data: activeAttempts, error: attemptsFetchError } = await queryClient
    .from("attempts")
    .select("id, start_time")
    .in("id", attemptIds);

  if (attemptsFetchError || !activeAttempts || activeAttempts.length === 0) {
    throw new Error("Failed to verify attempt timing");
  }

  // Session Integrity Verification:
  // All attempts in an active test session must have the exact same start_time from the RPC transaction
  const distinctStartTimes = new Set(
    activeAttempts.map(a => (a.start_time ? a.start_time.trim() : a.id))
  );

  if (distinctStartTimes.size > 1) {
    throw new Error(
      "Selected subjects have active attempts from different test sessions. Please complete or exit each in-progress session separately."
    );
  }

  const startTimes = activeAttempts.map(a => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);

  // Timing Rule: If TEST and test_duration_mins configured, use test duration; otherwise MAX(90, count * 60)
  let totalDurationMins: number;
  if (rpcResult.is_test && assessment.test_duration_mins && assessment.test_duration_mins > 0) {
    totalDurationMins = assessment.test_duration_mins;
  } else {
    totalDurationMins = Math.max(90, attemptIds.length * 60);
  }
  const totalDurationMs = totalDurationMins * 60 * 1000;

  // Secure the session with an HMAC-signed cookie scoped to this assessment
  const payload = JSON.stringify({
    studentId: user.id,
    assessmentId: assessmentId,
    attempts: attemptIds.join(","),
    startMs: authoritativeStartTimeMs,
    durationMs: totalDurationMs,
    isTest: rpcResult.is_test,
  });
  
  const secret = process.env.EXAM_SESSION_SECRET;
  if (!secret) {
    throw new Error("Server configuration error: EXAM_SESSION_SECRET is not set.");
  }
  
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  
  const cookieStore = await cookies();
  cookieStore.set(`exam_session_${assessmentId}`, JSON.stringify({ payload, signature }), { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  return { success: true, redirectUrl: `/student/assessment/${assessmentId}/exam` };
}

