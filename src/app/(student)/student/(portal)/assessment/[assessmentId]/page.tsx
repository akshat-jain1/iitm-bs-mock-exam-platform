import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { canAccessAssignment } from "@/lib/assessment-access";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SubjectSelectionClient } from "./SubjectSelectionClient";
import { getStudentTestResultsAction } from "@/app/(student)/student/(portal)/results/actions";

interface EligibleSubject {
  id: string;
  assessmentSubjectId: string;
  code: string;
  name: string;
}

interface ValidSubjectRow {
  id: string;
  subjects: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
}

interface AssessmentResponse {
  id: string;
  title: string;
  scheduled_start: string | null;
  status: string;
  assessment_types: { name: string } | { name: string }[] | null;
}

function isAttemptSessionExpired(startTimeMs: number, durationMs: number): boolean {
  return Date.now() > (startTimeMs + durationMs);
}

export default async function AssessmentDetailsPage({ 
  params,
  searchParams,
}: { 
  params: Promise<{ assessmentId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Await params and searchParams for Next.js 15+ compatibility
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryError = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;
  const queryCompletedParam = resolvedSearchParams.completed === "true" || resolvedSearchParams.submitted === "true";
  
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Fetch Assessment Event, student enrollments, user role, and student attempts concurrently
  const [assessmentRes, enrollmentsRes, attemptsRes] = await Promise.all([
    supabase
      .from("assessment_events")
      .select(`
        id,
        title,
        scheduled_start,
        status,
        assignment_type,
        test_access_mode,
        test_duration_mins,
        assessment_types ( name )
      `)
      .eq("id", resolvedParams.assessmentId)
      .single(),
    supabase
      .from("student_enrollments")
      .select("subject_id")
      .eq("student_id", user.id)
      .eq("is_active", true),
    supabase
      .from("attempts")
      .select(`
        id,
        status,
        start_time,
        end_time,
        created_at,
        assessment_subject_id,
        assessment_subjects!inner (
          id,
          assessment_event_id,
          subject_id,
          subjects ( id, name, code )
        )
      `)
      .eq("student_id", user.id)
      .eq("assessment_subjects.assessment_event_id", resolvedParams.assessmentId),
  ]);

  const assessment = assessmentRes.data;
  if (assessmentRes.error || !assessment) {
    notFound();
  }

  const userRole = await getCachedUserRole(user, { skipJwtClaim: true });
  if (!canAccessAssignment(userRole, assessment.assignment_type)) notFound();
  const isTestAssessment = assessment.assignment_type === 'TEST';
  const isTesterOnly = isTestAssessment && assessment.test_access_mode === 'TESTER_ONLY';
  const canBypassEnrollment = isTesterOnly && ['tester', 'admin'].includes(userRole);

  // Resume or safely finalize active Live attempts
  const studentAttempts = (attemptsRes.data as Array<{
    id: string;
    status: string;
    start_time: string;
    end_time: string | null;
    created_at: string;
    assessment_subject_id: string;
    assessment_subjects: {
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] | null;
    } | Array<{
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] | null;
    }>;
  }>) || [];

  const liveAttempts = studentAttempts.filter(a => a.status === "Live");

  if (liveAttempts.length > 0) {
    const startTimes = liveAttempts.map(a => new Date(a.start_time).getTime());
    const authoritativeStartTimeMs = Math.min(...startTimes);
    let totalDurationMins: number;
    if (isTestAssessment && assessment.test_duration_mins && assessment.test_duration_mins > 0) {
      totalDurationMins = assessment.test_duration_mins;
    } else {
      totalDurationMins = Math.max(90, liveAttempts.length * 60);
    }
    const totalDurationMs = totalDurationMins * 60 * 1000;
    const isExpired = isAttemptSessionExpired(authoritativeStartTimeMs, totalDurationMs);

    if (isExpired) {
      if (queryError === "failed_to_finalize") {
        // Stop here: already in the failed_to_finalize error state.
        // Render the page with the actionable error below without re-attempting or redirecting in a loop.
      } else {
        let finalizationSucceeded = false;
        const serviceClient = getServiceClientOrNull();

        if (serviceClient) {
          try {
            const { data: rpcData, error: rpcError } = await serviceClient.rpc("finalize_attempts", {
              p_student_id: user.id,
              p_attempt_ids: liveAttempts.map((a) => a.id),
            });

            if (rpcError) {
              console.error("Failed to finalize expired attempts on assessment page (RPC error):", rpcError);
            } else {
              const result = rpcData as { success?: boolean } | null;
              if (result?.success) {
                finalizationSucceeded = true;
              } else {
                console.error("Finalize attempts did not return success:", rpcData);
              }
            }
          } catch (err) {
            console.error("Failed to finalize expired attempts on assessment page (exception):", err);
          }
        } else {
          console.error("Failed to finalize expired attempts on assessment page: service client is unavailable");
        }

        if (finalizationSucceeded) {
          redirect(`/student/assessment/${resolvedParams.assessmentId}?completed=true`);
        } else {
          redirect(`/student/assessment/${resolvedParams.assessmentId}?error=failed_to_finalize`);
        }
      }
    } else {
      redirect(`/student/assessment/${resolvedParams.assessmentId}/exam`);
    }
  }

  const enrollments = enrollmentsRes.data as Array<{ subject_id: string }> | null;
  const enrolledSubjectIds = enrollments?.map((e: { subject_id: string }) => e.subject_id) || [];

  // Fetch assessment subjects matching the enrollments, OR all offered subjects if tester in TESTER_ONLY mode
  let eligibleSubjects: EligibleSubject[] = [];

  if (canBypassEnrollment) {
    const queryClient = getServiceClientOrNull() || supabase;
    const { data: allOfferedSubjects } = await queryClient
      .from("assessment_subjects")
      .select(`
        id,
        subject_id,
        subjects ( id, name, code )
      `)
      .eq("assessment_event_id", resolvedParams.assessmentId);

    eligibleSubjects = (allOfferedSubjects as ValidSubjectRow[])?.map((vs) => {
      const subj = Array.isArray(vs.subjects) ? vs.subjects[0] : vs.subjects;
      return {
        id: subj?.id || '',
        assessmentSubjectId: (vs as ValidSubjectRow).id,
        code: subj?.code || '',
        name: subj?.name || ''
      };
    }) || [];
  } else if (enrolledSubjectIds.length > 0) {
    const { data: validSubjects } = await supabase
      .from("assessment_subjects")
      .select(`
        id,
        subject_id,
        subjects ( id, name, code )
      `)
      .eq("assessment_event_id", resolvedParams.assessmentId)
      .in("subject_id", enrolledSubjectIds);
    
    // We only need the subject details, we MUST NOT expose paper_set_version_id
    eligibleSubjects = (validSubjects as ValidSubjectRow[])?.map((vs) => {
      const subj = Array.isArray(vs.subjects) ? vs.subjects[0] : vs.subjects;
      return {
        id: subj?.id || '',
        assessmentSubjectId: (vs as ValidSubjectRow).id,
        code: subj?.code || '',
        name: subj?.name || ''
      };
    }) || [];
  }

  const assessmentData = assessment as unknown as AssessmentResponse;
  const typeName = Array.isArray(assessmentData.assessment_types) 
    ? assessmentData.assessment_types[0]?.name 
    : assessmentData.assessment_types?.name;

  const testResults = isTestAssessment 
    ? await getStudentTestResultsAction(resolvedParams.assessmentId)
    : null;

  const completedAttempts = studentAttempts.filter(a => a.status === "Completed");
  const hasCompletedProduction = !isTestAssessment && completedAttempts.length > 0;

  const isEventClosed = assessment.status === "Completed" || assessment.status === "Archived";
  const productionSubmission = hasCompletedProduction ? {
    isSubmitted: true,
    submittedAt: completedAttempts[0]?.end_time || completedAttempts[0]?.start_time || completedAttempts[0]?.created_at || null,
    subjects: completedAttempts.map((a) => {
      const as = Array.isArray(a.assessment_subjects) ? a.assessment_subjects[0] : a.assessment_subjects;
      const sub = Array.isArray(as?.subjects) ? as.subjects[0] : as?.subjects;
      return {
        id: a.id,
        code: sub?.code || "",
        name: sub?.name || "",
      };
    }),
    isEventClosed,
  } : null;

  const isServerVerifiedCompleted = (isTestAssessment && Boolean(testResults?.allAttempts?.length)) || hasCompletedProduction;
  const isCompleted = isServerVerifiedCompleted && queryCompletedParam;

  const displayError = queryError === "failed_to_finalize" ? null : queryError;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {queryError === "failed_to_finalize" && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900 dark:text-rose-200 shadow-xs">
          <div className="flex items-start sm:items-center space-x-3">
            <span className="text-rose-600 dark:text-rose-400 text-lg leading-none shrink-0 mt-0.5 sm:mt-0 font-bold">⚠️</span>
            <div className="text-sm font-medium">
              Your previous exam session has expired, but could not be finalized automatically. Please retry finalization or contact examination support.
            </div>
          </div>
          <Link
            href={`/student/assessment/${resolvedParams.assessmentId}`}
            className="shrink-0 inline-flex items-center justify-center px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Retry finalization ↻
          </Link>
        </div>
      )}

      {isTestAssessment && (
        <div className="p-4 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-xl flex items-center justify-between text-purple-900 dark:text-purple-200">
          <div>
            <span className="font-bold text-sm tracking-wide uppercase px-2 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded mr-2">Test Assignment</span>
            <span className="text-sm">Repeatable practice &amp; verification instance.</span>
          </div>
          {assessment.test_duration_mins && (
            <span className="text-xs font-semibold bg-purple-100 dark:bg-purple-900 px-2.5 py-1 rounded-full text-purple-700 dark:text-purple-300">
              Duration: {assessment.test_duration_mins} mins
            </span>
          )}
        </div>
      )}
      <SubjectSelectionClient 
        assessmentId={resolvedParams.assessmentId} 
        assessmentTitle={assessment.title}
        assessmentTypeName={typeName || (isTestAssessment ? "Test Assignment" : "Assessment")}
        eligibleSubjects={eligibleSubjects} 
        hasNoEnrollments={!canBypassEnrollment && enrolledSubjectIds.length === 0}
        isTest={isTestAssessment}
        testDurationMins={assessment.test_duration_mins}
        testResults={testResults}
        productionSubmission={productionSubmission}
        initialError={displayError}
        isCompleted={isCompleted}
      />
    </div>
  );
}
