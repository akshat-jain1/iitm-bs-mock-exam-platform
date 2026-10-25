import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { canAccessAssignment } from "@/lib/assessment-access";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { redirect } from "next/navigation";
import { CombinedExamClient } from "./CombinedExamClient";
import { ExamResponses, ExamStatuses } from "@/lib/types/exam";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import {
  getOrLoadPaperStructures,
  buildExamFromStructure,
  collectStoragePathsFromStructures,
  signPaperStoragePaths,
  applySignedUrlsToExam,
} from "@/lib/exam/paper-cache";

interface AssessmentSubjectWithSub {
  id: string;
  subject_id: string;
  paper_set_version_id: string;
  subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
}

export default async function CombinedExamPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const resolvedParams = await params;
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(`exam_session_${resolvedParams.assessmentId}`)?.value;
  let selectedAttemptIds: string[] = [];

  if (sessionCookie) {
    try {
      const { payload, signature } = JSON.parse(sessionCookie);
      const secret = process.env.EXAM_SESSION_SECRET;
      
      if (secret) {
        const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');
        if (signature === expectedSignature) {
          const parsedPayload = JSON.parse(payload);
          // Cryptographic binding validation
          if (
            parsedPayload.studentId === user.id && 
            parsedPayload.assessmentId === resolvedParams.assessmentId
          ) {
            selectedAttemptIds = parsedPayload.attempts.split(",").filter(Boolean);
          }
        }
      }
    } catch {}
  }

  const supabase = await createClient();

  // Use service client for loading all paper versions across the assessment event
  const queryClient = getServiceClientOrNull() || supabase;

  // Session recovery fallback:
  // If session cookie is missing or unverified, recover from active Live attempts in the database
  if (selectedAttemptIds.length === 0) {
    const { data: dbLiveAttempts } = await queryClient
      .from("attempts")
      .select(`
        id,
        start_time,
        assessment_subjects!inner (
          assessment_event_id
        )
      `)
      .eq("student_id", user.id)
      .eq("status", "Live")
      .eq("assessment_subjects.assessment_event_id", resolvedParams.assessmentId);

    if (dbLiveAttempts && dbLiveAttempts.length > 0) {
      const startTimes = new Set(
        dbLiveAttempts.map((a) => (a.start_time ? a.start_time.trim() : a.id))
      );
      if (startTimes.size === 1) {
        selectedAttemptIds = dbLiveAttempts.map((a) => a.id);
      }
    }
  }

  if (selectedAttemptIds.length === 0) {
    redirect(`/student/assessment/${resolvedParams.assessmentId}?error=no_active_session`);
  }

  // 1. Parallel fetch: attempts, all assessment subjects for event, and responses for selected attempts
  const [attemptsRes, allSubjectsRes, responsesRes] = await Promise.all([
    queryClient
      .from("attempts")
      .select(`
        id,
        student_id,
        start_time,
        status,
        paper_set_version_id,
        assessment_subjects!inner (
          id,
          subject_id,
          assessment_event_id,
          subjects (name, code),
          assessment_events (id, title, assignment_type, test_duration_mins)
        )
      `)
      .eq("student_id", user.id)
      .eq("status", "Live")
      .eq("assessment_subjects.assessment_event_id", resolvedParams.assessmentId)
      .in("id", selectedAttemptIds),
    queryClient
      .from("assessment_subjects")
      .select(`
        id,
        subject_id,
        paper_set_version_id,
        subjects!inner ( id, name, code )
      `)
      .eq("assessment_event_id", resolvedParams.assessmentId),
    supabase
      .from("responses")
      .select("attempt_id, question_version_id, data, marked_for_review")
      .in("attempt_id", selectedAttemptIds),
  ]);

  const attempts = attemptsRes.data;
  if (attemptsRes.error || !attempts || attempts.length === 0) {
    redirect(`/student/assessment/${resolvedParams.assessmentId}?error=attempts_not_found`);
  }

  // Sort attempts to match the order provided in the session cookie
  attempts.sort((a, b) => selectedAttemptIds.indexOf(a.id) - selectedAttemptIds.indexOf(b.id));

  // Session Integrity Verification:
  // All attempts in an active exam session must have the exact same start_time
  const distinctStartTimes = new Set(
    attempts.map(a => (a.start_time ? a.start_time.trim() : a.id))
  );
  if (distinctStartTimes.size > 1) {
    redirect(`/student/assessment/${resolvedParams.assessmentId}`);
  }

  // Determine assignment type and test duration
  const firstAs = attempts[0].assessment_subjects as unknown as {
    assessment_events: {
      id: string;
      title: string;
      assignment_type?: string;
      test_duration_mins?: number | null;
    } | Array<{ id: string; title: string; assignment_type?: string; test_duration_mins?: number | null }>;
  };
  const eventObj = Array.isArray(firstAs.assessment_events) ? firstAs.assessment_events[0] : firstAs.assessment_events;
  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  if (!canAccessAssignment(role, eventObj?.assignment_type || "")) redirect("/student/exams");
  const isTest = eventObj?.assignment_type === 'TEST';
  const testDurationMins = eventObj?.test_duration_mins;

  // Authoritative duration is calculated strictly from the selected / attemptable subjects
  const startTimes = attempts.map(a => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);
  
  const selectedSubjectCount = attempts.length;
  // Timing Rule: If TEST and test_duration_mins configured, use test duration; otherwise MAX(90, count * 60)
  let totalDurationMins: number;
  if (isTest && testDurationMins && testDurationMins > 0) {
    totalDurationMins = testDurationMins;
  } else {
    totalDurationMins = Math.max(90, selectedSubjectCount * 60);
  }
  const totalDurationMs = totalDurationMins * 60 * 1000;
  
  const expirationTimeMs = authoritativeStartTimeMs + totalDurationMs;
  // Early submit is unlocked immediately for TEST assignments, but locked until expiration for PRODUCTION
  const manualSubmitUnlockTimeMs = isTest ? authoritativeStartTimeMs : expirationTimeMs;
  const currentTimeMs = new Date().getTime();

  if (currentTimeMs > expirationTimeMs) {
    // Atomically finalize expired attempts so they are evaluated and status updated to Completed
    const serviceClient = getServiceClientOrNull();
    if (serviceClient) {
      try {
        await serviceClient.rpc("finalize_attempts", {
          p_student_id: user.id,
          p_attempt_ids: attempts.map((a) => a.id),
        });
      } catch (err) {
        console.error("Failed to finalize expired attempts on exam route:", err);
      }
    }
    redirect(`/student/assessment/${resolvedParams.assessmentId}?completed=true`);
  }

  const allAssessmentSubjects = allSubjectsRes.data || [];
  const allResponses = responsesRes.data || [];

  // Index responses by attempt_id
  const responsesByAttempt = new Map<string, typeof allResponses>();
  for (const r of allResponses) {
    if (!responsesByAttempt.has(r.attempt_id)) {
      responsesByAttempt.set(r.attempt_id, []);
    }
    responsesByAttempt.get(r.attempt_id)!.push(r);
  }

  // 3. Load immutable paper structures ONLY for selected / attemptable subjects initially
  const selectedPaperIds = Array.from(
    new Set(attempts.map((a) => a.paper_set_version_id).filter(Boolean))
  );

  const paperMap = await getOrLoadPaperStructures(selectedPaperIds, queryClient);

  // Collect and batch-sign storage paths ONLY for selected subjects
  const storagePaths = collectStoragePathsFromStructures(paperMap.values());
  const remainingSeconds = Math.max(300, Math.floor((expirationTimeMs - currentTimeMs) / 1000));
  const signedUrlMap = await signPaperStoragePaths(storagePaths, queryClient, remainingSeconds);

  const subjectExams = [];
  const selectedAsIds = new Set<string>();

  // A. Process all SELECTED / ATTEMPTABLE subjects
  for (const attempt of attempts) {
    const asId = (attempt.assessment_subjects as unknown as { id: string }).id;
    selectedAsIds.add(asId);

    const paperStructure = paperMap.get(attempt.paper_set_version_id);
    if (!paperStructure) continue;

    const exam = buildExamFromStructure(paperStructure, user, totalDurationMins * 60);
    applySignedUrlsToExam(exam, signedUrlMap);
    const subjData = (attempt.assessment_subjects as unknown as { subjects: { name: string; code: string } }).subjects;
    const savedResponses = responsesByAttempt.get(attempt.id) || [];

    const initialResponses: ExamResponses = {};
    const initialStatuses: ExamStatuses = {};

    for (const r of savedResponses) {
      const q = exam.questions.find((q) => q.id === r.question_version_id);
      if (q) {
        let hasCommitted = false;
        if (r.data !== null && r.data !== undefined) {
          let dataObj = r.data as { selected_option_id?: string; selected_option_ids?: string[]; value?: number } | string;
          if (typeof dataObj === "string") {
            try { dataObj = JSON.parse(dataObj); } catch {}
          }
          const typedData = dataObj as { selected_option_id?: string; selected_option_ids?: string[]; value?: number };

          if (q.type === "MCQ" && typedData?.selected_option_id !== undefined && typedData.selected_option_id !== "") {
            initialResponses[r.question_version_id] = typedData.selected_option_id;
            hasCommitted = true;
          } else if (q.type === "MSQ" && typedData?.selected_option_ids !== undefined) {
            initialResponses[r.question_version_id] = typedData.selected_option_ids;
            hasCommitted = typedData.selected_option_ids.length > 0;
          } else if (q.type === "NUMERICAL" && typedData?.value !== undefined) {
            initialResponses[r.question_version_id] = typedData.value;
            hasCommitted = true;
          }
        }

        initialStatuses[r.question_version_id] = {
          visited: true,
          answered: hasCommitted,
          markedForReview: !!r.marked_for_review,
        };
      }
    }

    exam.questions.forEach((q, idx) => {
      if (!initialStatuses[q.id]) {
        initialStatuses[q.id] = {
          visited: idx === 0,
          answered: false,
          markedForReview: false,
        };
      }
    });

    subjectExams.push({
      attemptId: attempt.id,
      assessmentSubjectId: asId,
      subjectName: subjData?.name || "Subject",
      subjectCode: subjData?.code || "",
      isAttemptable: true,
      exam,
      initialResponses,
      initialStatuses,
    });
  }

  // B. Process NON-SELECTED subjects in the assessment event (unselected metadata only, NO heavy payload)
  const unselectedSubjects = ((allAssessmentSubjects || []) as unknown as AssessmentSubjectWithSub[])
    .filter((as) => !selectedAsIds.has(as.id));

  unselectedSubjects.sort((a, b) => {
    const sA = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects;
    const sB = Array.isArray(b.subjects) ? b.subjects[0] : b.subjects;
    return (sA?.code || "").localeCompare(sB?.code || "");
  });

  for (const as of unselectedSubjects) {
    const subj = Array.isArray(as.subjects) ? as.subjects[0] : as.subjects;

    subjectExams.push({
      attemptId: `unselected-${as.id}`,
      assessmentSubjectId: as.id,
      subjectName: subj?.name || "Subject",
      subjectCode: subj?.code || "",
      isAttemptable: false,
      exam: undefined,
      initialResponses: {},
      initialStatuses: {},
    });
  }

  const assessmentTitle = (attempts[0].assessment_subjects as unknown as { assessment_events: { title: string } }).assessment_events.title;
  // eslint-disable-next-line react-hooks/purity
  const initialTimeLeft = Math.max(0, Math.floor((expirationTimeMs - Date.now()) / 1000));

  return (
    <CombinedExamClient 
      assessmentId={resolvedParams.assessmentId}
      assessmentTitle={assessmentTitle}
      subjectExams={subjectExams}
      expirationTimeMs={expirationTimeMs}
      manualSubmitUnlockTimeMs={manualSubmitUnlockTimeMs}
      initialTimeLeft={initialTimeLeft}
      isTest={isTest}
    />
  );
}
