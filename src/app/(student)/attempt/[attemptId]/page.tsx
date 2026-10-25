import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { canAccessAssignment } from "@/lib/assessment-access";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { getStudentAttemptReviewAction } from "@/app/(student)/student/(portal)/results/actions";

interface AssessmentSubjectWithEvent {
  id: string;
  assessment_event_id: string;
  assessment_events: {
    id: string;
    title: string;
    assignment_type?: string;
    test_duration_mins?: number | null;
  } | Array<{
    id: string;
    title: string;
    assignment_type?: string;
    test_duration_mins?: number | null;
  }>;
}

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const resolvedParams = await params;
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;

  // 1. Fetch Attempt & verify ownership
  const { data: attempt, error: attemptError } = await queryClient
    .from("attempts")
    .select(`
      id,
      student_id,
      status,
      start_time,
      assessment_subject_id,
      assessment_subjects!inner (
        id,
        assessment_event_id,
        assessment_events!inner (
          id,
          title,
          assignment_type,
          test_duration_mins
        )
      )
    `)
    .eq("id", resolvedParams.attemptId)
    .single();

  if (attemptError || !attempt || attempt.student_id !== user.id) {
    notFound();
  }

  const as = attempt.assessment_subjects as unknown as AssessmentSubjectWithEvent;
  const event = Array.isArray(as.assessment_events) ? as.assessment_events[0] : as.assessment_events;
  const assessmentId = as.assessment_event_id;
  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  if (!canAccessAssignment(role, event?.assignment_type || "")) notFound();
  const isTest = event?.assignment_type === "TEST";

  // 2. Handle Completed / Non-Live attempts (A completed attempt must not be restarted)
  if (attempt.status !== "Live") {
    try {
      const reviewData = await getStudentAttemptReviewAction(attempt.id);
      if (reviewData?.allowed) {
        redirect(`/student/results/review/${attempt.id}`);
      }
    } catch {
      // If review check throws, safely route to assessment details
    }
    redirect(`/student/assessment/${assessmentId}?completed=true`);
  }

  // 3. Handle Live attempt: calculate authoritative timing across session attempts
  const { data: liveAttempts } = await queryClient
    .from("attempts")
    .select("id, start_time")
    .eq("student_id", user.id)
    .eq("status", "Live")
    .eq("assessment_subjects.assessment_event_id", assessmentId);

  const attemptsToConsider = liveAttempts && liveAttempts.length > 0 ? liveAttempts : [attempt];
  const startTimes = attemptsToConsider.map((a) => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);

  let totalDurationMins: number;
  if (isTest && event?.test_duration_mins && event.test_duration_mins > 0) {
    totalDurationMins = event.test_duration_mins;
  } else {
    totalDurationMins = Math.max(90, attemptsToConsider.length * 60);
  }
  const totalDurationMs = totalDurationMins * 60 * 1000;
  const expirationTimeMs = authoritativeStartTimeMs + totalDurationMs;
  const currentTimeMs = Date.now();

  // 4. Handle Expired attempt: finalize atomically and route to completed
  if (currentTimeMs > expirationTimeMs) {
    const serviceClient = getServiceClientOrNull();
    let finalizationFailed = false;

    if (serviceClient) {
      try {
        const { error: finalizeErr } = await serviceClient.rpc("finalize_attempts", {
          p_student_id: user.id,
          p_attempt_ids: attemptsToConsider.map((a) => a.id),
        });
        if (finalizeErr) {
          console.error("Failed to finalize expired attempt on legacy route:", finalizeErr);
          finalizationFailed = true;
        }
      } catch (err) {
        console.error("Error finalizing expired attempt on legacy route:", err);
        finalizationFailed = true;
      }
    } else {
      finalizationFailed = true;
    }

    if (finalizationFailed) {
      redirect(`/student/assessment/${assessmentId}?error=failed_to_finalize`);
    }
    redirect(`/student/assessment/${assessmentId}?completed=true`);
  }

  // 5. Active Live attempt: Route to canonical exam experience without resetting timer
  redirect(`/student/assessment/${assessmentId}/exam`);
}
