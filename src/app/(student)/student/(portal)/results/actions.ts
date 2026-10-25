"use server";

import { reviewBlockedReason } from "@/lib/results/release";
import { loadAttemptReview } from "@/lib/results/attempt-review";
import { hideAnswerKeys } from "@/lib/results/practice";
import type { ReferenceMaterial, ExamSection, QuestionGroup } from "@/lib/types/exam";
import type { QuestionImageAsset } from "@/lib/question-images";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { isAllowedScalerEmail } from "@/lib/auth/config";


export interface StudentSubjectResult {
  attemptId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  score: number;
  maxMarks: number;
  percentage: number | null;
  status: string;
  evaluatedAt: string | null;
}

export interface StudentExamResult {
  examId: string;
  examTitle: string;
  assessmentType: string;
  evaluatedAt: string | null;
  overallScore: number;
  overallMaxMarks: number;
  overallPercentage: number | null;
  subjectsCount: number;
  subjectResults: StudentSubjectResult[];
}

export async function getStudentResultsAction(): Promise<StudentExamResult[]> {
  const user = await getCachedUser();

  if (!user) {
    return [];
  }

  const supabase = await createClient();

  // 1. Fetch current student's completed/evaluated attempts with results
  const { data: attempts, error: attemptsError } = await supabase
    .from("attempts")
    .select(`
      id,
      assessment_subject_id,
      paper_set_version_id,
      status,
      start_time,
      end_time,
      results!inner (
        score,
        max_marks,
        status,
        evaluated_at
      ),
      assessment_subjects!inner (
        id,
        assessment_event_id,
        subject_id,
        subjects!inner ( id, name, code ),
        assessment_events!inner (
          id,
          title,
          scheduled_start,
          status,
          assessment_types ( name )
        )
      )
    `)
    .eq("student_id", user.id)
    .eq("is_test", false)
    .eq("assessment_subjects.assessment_events.assignment_type", "PRODUCTION")
    .not("results.score", "is", null);

  if (attemptsError || !attempts || attempts.length === 0) {
    return [];
  }

  // 2. Resolve maximum marks: use stored max_marks on results, and only query version hierarchy if missing
  const maxMarksMap: Record<string, number> = {};
  const missingPsvIds = new Set<string>();

  (attempts as unknown as AttemptJoined[]).forEach((att) => {
    const res = Array.isArray(att.results) ? att.results[0] : att.results;
    if (res && res.max_marks != null) {
      maxMarksMap[att.paper_set_version_id] = Number(res.max_marks);
    } else if (att.paper_set_version_id && maxMarksMap[att.paper_set_version_id] === undefined) {
      missingPsvIds.add(att.paper_set_version_id);
    }
  });

  if (missingPsvIds.size > 0) {
    const psvIds = Array.from(missingPsvIds);
    // Use service client for authoritative marks calculation across version tables
    const queryClient = getServiceClientOrNull() || supabase;

    const { data: secVers } = await queryClient
      .from("section_versions")
      .select("id, paper_set_version_id")
      .in("paper_set_version_id", psvIds);

    const secIds = (secVers || []).map((s) => s.id);
    const secToPsv = new Map<string, string>();
    (secVers || []).forEach((s) => secToPsv.set(s.id, s.paper_set_version_id));

    const grpIds: string[] = [];
    const grpToPsv = new Map<string, string>();

    if (secIds.length > 0) {
      const { data: grpVers } = await queryClient
        .from("group_versions")
        .select("id, section_version_id")
        .in("section_version_id", secIds);

      (grpVers || []).forEach((g) => {
        const psvId = secToPsv.get(g.section_version_id);
        if (psvId) {
          grpIds.push(g.id);
          grpToPsv.set(g.id, psvId);
        }
      });

      const [secQRes, grpQRes] = await Promise.all([
        queryClient
          .from("question_versions")
          .select("marks, section_version_id")
          .in("section_version_id", secIds),
        grpIds.length > 0
          ? queryClient
              .from("question_versions")
              .select("marks, group_version_id")
              .in("group_version_id", grpIds)
          : Promise.resolve({ data: [] }),
      ]);

      (secQRes.data || []).forEach((q) => {
        if (q.section_version_id) {
          const psvId = secToPsv.get(q.section_version_id);
          if (psvId) {
            maxMarksMap[psvId] = (maxMarksMap[psvId] || 0) + Number(q.marks || 0);
          }
        }
      });

      (grpQRes.data || []).forEach((q) => {
        if (q.group_version_id) {
          const psvId = grpToPsv.get(q.group_version_id);
          if (psvId) {
            maxMarksMap[psvId] = (maxMarksMap[psvId] || 0) + Number(q.marks || 0);
          }
        }
      });
    }
  }

  // 3. Group by assessment event
  interface AttemptJoined {
    id: string;
    paper_set_version_id: string;
    results: { score: number | string; max_marks?: number | string | null; status: string; evaluated_at: string } | { score: number | string; max_marks?: number | string | null; status: string; evaluated_at: string }[];
    assessment_subjects: {
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
      assessment_events: {
        id: string;
        title: string;
        scheduled_start: string | null;
        status: string;
        assessment_types: { name: string } | { name: string }[] | null;
      } | { id: string; title: string; scheduled_start: string | null; status: string; assessment_types: { name: string } | { name: string }[] | null }[];
    } | {
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
      assessment_events: {
        id: string;
        title: string;
        scheduled_start: string | null;
        status: string;
        assessment_types: { name: string } | { name: string }[] | null;
      } | { id: string; title: string; scheduled_start: string | null; status: string; assessment_types: { name: string } | { name: string }[] | null }[];
    }[];
  }

  const examMap = new Map<string, StudentExamResult>();

  (attempts as unknown as AttemptJoined[]).forEach((att) => {
    const asub = Array.isArray(att.assessment_subjects) ? att.assessment_subjects[0] : att.assessment_subjects;
    if (!asub) return;

    const event = Array.isArray(asub.assessment_events) ? asub.assessment_events[0] : asub.assessment_events;
    if (!event) return;

    const sub = Array.isArray(asub.subjects) ? asub.subjects[0] : asub.subjects;
    const res = Array.isArray(att.results) ? att.results[0] : att.results;
    if (!res) return;

    const score = Number(res.score || 0);
    const maxMarks = maxMarksMap[att.paper_set_version_id] || 0;
    const percentage = maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(1)) : null;

    const typeObj = Array.isArray(event.assessment_types) ? event.assessment_types[0] : event.assessment_types;
    const typeName = typeObj?.name || "Standard Exam";

    const subjectResult: StudentSubjectResult = {
      attemptId: att.id,
      subjectId: sub?.id || "",
      subjectName: sub?.name || "Subject",
      subjectCode: sub?.code || "",
      score,
      maxMarks,
      percentage,
      status: res.status || "Evaluated",
      evaluatedAt: res.evaluated_at || null,
    };

    if (!examMap.has(event.id)) {
      examMap.set(event.id, {
        examId: event.id,
        examTitle: event.title,
        assessmentType: typeName,
        evaluatedAt: res.evaluated_at || null,
        overallScore: score,
        overallMaxMarks: maxMarks,
        overallPercentage: percentage,
        subjectsCount: 1,
        subjectResults: [subjectResult],
      });
    } else {
      const existing = examMap.get(event.id)!;
      existing.subjectResults.push(subjectResult);
      existing.subjectsCount += 1;
      existing.overallScore += score;
      existing.overallMaxMarks += maxMarks;
      existing.overallPercentage =
        existing.overallMaxMarks > 0
          ? Number(((existing.overallScore / existing.overallMaxMarks) * 100).toFixed(1))
          : null;
      if (res.evaluated_at && (!existing.evaluatedAt || new Date(res.evaluated_at) > new Date(existing.evaluatedAt))) {
        existing.evaluatedAt = res.evaluated_at;
      }
    }
  });

  // Sort exams by most recent evaluation date descending
  return Array.from(examMap.values()).sort((a, b) => {
    const timeA = a.evaluatedAt ? new Date(a.evaluatedAt).getTime() : 0;
    const timeB = b.evaluatedAt ? new Date(b.evaluatedAt).getTime() : 0;
    return timeB - timeA;
  });
}

export interface StudentTestAttemptResult {
  attemptNumber: number;
  evaluatedAt: string | null;
  overallScore: number;
  overallMaxMarks: number;
  overallPercentage: number | null;
  subjectsCount: number;
  subjectResults: StudentSubjectResult[];
}

export interface StudentTestResultsData {
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: string;
  assignmentType: "TEST";
  testAttemptPolicy: "UNLIMITED" | "LIMITED";
  testMaxAttempts: number | null;
  canRetake: boolean;
  totalAttemptsTaken: number;
  latestAttempt: StudentTestAttemptResult | null;
  allAttempts: StudentTestAttemptResult[];
}

export async function getStudentTestResultsAction(assessmentId: string): Promise<StudentTestResultsData | null> {
  const user = await getCachedUser();
  if (!user || !user.email) {
    return null;
  }

  if (!isAllowedScalerEmail(user.email)) {
    return null;
  }

  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  if (role !== "tester" && role !== "admin") return null;

  const supabase = await createClient();

  // Authoritative check: ensure event exists and is a TEST assignment
  const { data: event, error: eventError } = await supabase
    .from("assessment_events")
    .select(`
      id,
      title,
      status,
      assignment_type,
      test_attempt_policy,
      test_max_attempts,
      assessment_types ( name )
    `)
    .eq("id", assessmentId)
    .single();

  if (eventError || !event || event.assignment_type !== "TEST") {
    return null;
  }

  const { data: attempts, error } = await supabase
    .from("attempts")
    .select(`
      id,
      attempt_number,
      assessment_subject_id,
      paper_set_version_id,
      status,
      start_time,
      end_time,
      results!inner (
        score,
        max_marks,
        status,
        evaluated_at
      ),
      assessment_subjects!inner (
        id,
        assessment_event_id,
        subject_id,
        subjects!inner ( id, name, code )
      )
    `)
    .eq("student_id", user.id)
    .eq("is_test", true)
    .eq("assessment_subjects.assessment_event_id", assessmentId)
    .not("results.score", "is", null)
    .order("attempt_number", { ascending: false });

  if (error) {
    console.error("Error fetching student test attempts:", error);
    return null;
  }

  // Group attempts into sessions using exact start_time equality.
  // Attempts created together in start_student_attempts share the exact same transaction timestamp.
  const sessionMap = new Map<string, typeof attempts>();
  for (const att of attempts || []) {
    const key = att.start_time ? att.start_time.trim() : att.id;
    const existing = sessionMap.get(key);
    if (existing) {
      existing.push(att);
    } else {
      sessionMap.set(key, [att]);
    }
  }

  // Sort sessions chronologically ascending by start_time so session numbers (1, 2, ... N) are chronological
  const sessionClusters = Array.from(sessionMap.entries())
    .sort(([keyA], [keyB]) => {
      const timeA = new Date(keyA).getTime() || 0;
      const timeB = new Date(keyB).getTime() || 0;
      return timeA - timeB;
    })
    .map(([, clusterRows]) => clusterRows);

  // Number test sessions sequentially (1, 2, ... N) and sort descending for student UI
  const allAttempts: StudentTestAttemptResult[] = sessionClusters
    .map((clusterRows, idx) => {
      const sessionNumber = idx + 1;
      let latestEvaluatedAt: string | null = null;

      const subjectResults: StudentSubjectResult[] = clusterRows.map((att) => {
        const sAsub = Array.isArray(att.assessment_subjects) ? att.assessment_subjects[0] : att.assessment_subjects;
        const sub = Array.isArray(sAsub.subjects) ? sAsub.subjects[0] : sAsub.subjects;
        const res = Array.isArray(att.results) ? att.results[0] : att.results;
        const score = Number(res?.score || 0);
        const maxMarks = Number(res?.max_marks || 0);
        const percentage = maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(1)) : null;
        const evalAt = res?.evaluated_at || att.end_time || null;
        if (evalAt && (!latestEvaluatedAt || new Date(evalAt) > new Date(latestEvaluatedAt))) {
          latestEvaluatedAt = evalAt;
        }

        return {
          attemptId: att.id,
          subjectId: sub?.id || "",
          subjectName: sub?.name || "Subject",
          subjectCode: sub?.code || "",
          score,
          maxMarks,
          percentage,
          status: res?.status || "Evaluated",
          evaluatedAt: evalAt,
        };
      });

      const overallScore = subjectResults.reduce((acc, s) => acc + s.score, 0);
      const overallMaxMarks = subjectResults.reduce((acc, s) => acc + s.maxMarks, 0);
      const overallPercentage = overallMaxMarks > 0 ? Number(((overallScore / overallMaxMarks) * 100).toFixed(1)) : null;

      return {
        attemptNumber: sessionNumber,
        evaluatedAt: latestEvaluatedAt,
        overallScore,
        overallMaxMarks,
        overallPercentage,
        subjectsCount: subjectResults.length,
        subjectResults,
      };
    })
    .sort((a, b) => b.attemptNumber - a.attemptNumber);

  const totalAttemptsTaken = allAttempts.length;
  const maxSubjectAttempts = (attempts || []).reduce((max, att) => Math.max(max, att.attempt_number || 0), 0);

  const isLive = event.status === "Live";
  let canRetake = false;
  if (isLive) {
    if (event.test_attempt_policy === "UNLIMITED") {
      canRetake = true;
    } else if (event.test_attempt_policy === "LIMITED") {
      const maxAttempts = event.test_max_attempts || 1;
      canRetake = totalAttemptsTaken < maxAttempts && maxSubjectAttempts < maxAttempts;
    }
  }

  const typeObj = Array.isArray(event.assessment_types) ? event.assessment_types[0] : event.assessment_types;

  return {
    assessmentId: event.id,
    assessmentTitle: event.title,
    assessmentType: typeObj?.name || "Test Assignment",
    assignmentType: "TEST",
    testAttemptPolicy: (event.test_attempt_policy as "UNLIMITED" | "LIMITED") || "UNLIMITED",
    testMaxAttempts: event.test_max_attempts ?? null,
    canRetake,
    totalAttemptsTaken,
    latestAttempt: allAttempts[0] || null,
    allAttempts,
  };
}

// ------------------------------------------------------------------------------
// PHASE 2: STUDENT EXAM HISTORY & ANSWER REVIEW
// ------------------------------------------------------------------------------

export interface StudentExamHistorySubject {
  attemptId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  score: number;
  maxMarks: number;
  percentage: number | null;
  status: string;
  canReviewAnswers: boolean;
  reviewBlockedReason?: string;
}

export interface StudentExamHistorySession {
  sessionId: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentTypeName: string;
  assignmentType: "PRODUCTION" | "TEST";
  isTest: boolean;
  attemptNumber: number;
  completedAt: string | null;
  overallScore: number;
  overallMaxMarks: number;
  overallPercentage: number | null;
  status: "Evaluated" | "Pending Review";
  canReviewAnswers: boolean;
  reviewBlockedReason?: string;
  primaryAttemptId: string;
  subjects: StudentExamHistorySubject[];
}

export interface OptionReview {
  id: string;
  text: string;
  textHtml?: string;
  imageUrl?: string;
  imageUrls?: string[];
  images?: QuestionImageAsset[];
  isStudentSelected: boolean;
  isCorrect?: boolean;
}

export interface QuestionReviewItem {
  id: string;
  sequenceNumber: number;
  sourceQuestionNumber?: number;
  type: "MCQ" | "MSQ" | "NUMERICAL";
  text: string;
  textHtml?: string;
  marks: number;
  marksAwarded?: number;
  status: "CORRECT" | "INCORRECT" | "UNANSWERED" | "PENDING";
  imageUrl?: string;
  imageUrls?: string[];
  images?: QuestionImageAsset[];
  codeSnippet?: string;
  sectionId?: string;
  groupId?: string;
  options?: OptionReview[];
  studentAnswerText?: string;
  correctAnswerText?: string;
  numericalEvaluation?: {
    mode: "EXACT" | "RANGE";
    exactVal?: number | null;
    minVal?: number | null;
    maxVal?: number | null;
  };
}

export interface SiblingSubjectReview {
  attemptId: string;
  subjectName: string;
  subjectCode: string;
  isCurrent: boolean;
}

export interface StudentAttemptReviewResult {
  allowed: boolean;
  reason?: string;
  attemptId?: string;
  assessmentTitle?: string;
  assessmentType?: string;
  assignmentType?: "PRODUCTION" | "TEST";
  isTest?: boolean;
  isTester?: boolean;
  subjectName?: string;
  subjectCode?: string;
  attemptNumber?: number;
  completedAt?: string | null;
  score?: number;
  maxMarks?: number;
  percentage?: number | null;
  status?: string;
  answersReleased?: boolean;
  referenceMaterial?: ReferenceMaterial;
  sections?: ExamSection[];
  groups?: QuestionGroup[];
  questions?: QuestionReviewItem[];
  siblingSubjects?: SiblingSubjectReview[];
}

export async function getStudentExamHistoryAction(): Promise<StudentExamHistorySession[]> {
  const user = await getCachedUser();
  if (!user || !user.email) {
    return [];
  }

  if (!isAllowedScalerEmail(user.email)) {
    return [];
  }

  const supabase = await createClient();
  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  const isTester = role === "tester" || role === "admin";

  // 1. Fetch current student's completed/submitted attempts with results across both Test and Production
  let query = supabase
    .from("attempts")
    .select(`
      id,
      attempt_number,
      is_test,
      status,
      start_time,
      end_time,
      paper_set_version_id,
      results (
        score,
        max_marks,
        status,
        evaluated_at
      ),
      assessment_subjects!inner (
        id,
        assessment_event_id,
        subject_id,
        subjects!inner ( id, name, code ),
        assessment_events!inner (
          id,
          title,
          status,
          assignment_type,
          assessment_types ( name )
        )
      )
    `)
    .eq("student_id", user.id)
    .in("status", ["Completed", "Submitted"])
    .order("start_time", { ascending: false });

  if (!isTester) {
    query = query.eq("is_test", false).eq("assessment_subjects.assessment_events.assignment_type", "PRODUCTION");
  }
  const { data: rawAttempts, error: attemptsError } = await query;

  if (attemptsError || !rawAttempts || rawAttempts.length === 0) {
    return [];
  }

  interface AttemptRow {
    id: string;
    attempt_number: number | null;
    is_test: boolean;
    status: string;
    start_time: string | null;
    end_time: string | null;
    paper_set_version_id: string;
    results:
      | { score: number | string | null; max_marks?: number | string | null; status: string; evaluated_at: string | null }
      | { score: number | string | null; max_marks?: number | string | null; status: string; evaluated_at: string | null }[]
      | null;
    assessment_subjects: {
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
      assessment_events: {
        id: string;
        title: string;
        status: string;
        assignment_type: string;
        assessment_types: { name: string } | { name: string }[] | null;
      } | {
        id: string;
        title: string;
        status: string;
        assignment_type: string;
        assessment_types: { name: string } | { name: string }[] | null;
      }[];
    } | {
      id: string;
      assessment_event_id: string;
      subject_id: string;
      subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
      assessment_events: {
        id: string;
        title: string;
        status: string;
        assignment_type: string;
        assessment_types: { name: string } | { name: string }[] | null;
      } | {
        id: string;
        title: string;
        status: string;
        assignment_type: string;
        assessment_types: { name: string } | { name: string }[] | null;
      }[];
    }[];
  }

  const attempts = rawAttempts as unknown as AttemptRow[];

  // 2. Resolve maximum marks: check stored max_marks on results first, query version hierarchy if missing
  const maxMarksMap: Record<string, number> = {};
  const missingPsvIds = new Set<string>();

  attempts.forEach((att) => {
    const res = Array.isArray(att.results) ? att.results[0] : att.results;
    if (res && res.max_marks != null) {
      maxMarksMap[att.paper_set_version_id] = Number(res.max_marks);
    } else if (att.paper_set_version_id && maxMarksMap[att.paper_set_version_id] === undefined) {
      missingPsvIds.add(att.paper_set_version_id);
    }
  });

  if (missingPsvIds.size > 0) {
    const psvIds = Array.from(missingPsvIds);
    const queryClient = getServiceClientOrNull() || supabase;

    const { data: secVers } = await queryClient
      .from("section_versions")
      .select("id, paper_set_version_id")
      .in("paper_set_version_id", psvIds);

    const secIds = (secVers || []).map((s) => s.id);
    const secToPsv = new Map<string, string>();
    (secVers || []).forEach((s) => secToPsv.set(s.id, s.paper_set_version_id));

    const grpIds: string[] = [];
    const grpToPsv = new Map<string, string>();

    if (secIds.length > 0) {
      const { data: grpVers } = await queryClient
        .from("group_versions")
        .select("id, section_version_id")
        .in("section_version_id", secIds);

      (grpVers || []).forEach((g) => {
        const psvId = secToPsv.get(g.section_version_id);
        if (psvId) {
          grpIds.push(g.id);
          grpToPsv.set(g.id, psvId);
        }
      });

      const [secQRes, grpQRes] = await Promise.all([
        queryClient
          .from("question_versions")
          .select("marks, section_version_id")
          .in("section_version_id", secIds),
        grpIds.length > 0
          ? queryClient
              .from("question_versions")
              .select("marks, group_version_id")
              .in("group_version_id", grpIds)
          : Promise.resolve({ data: [] }),
      ]);

      (secQRes.data || []).forEach((q) => {
        if (q.section_version_id) {
          const psvId = secToPsv.get(q.section_version_id);
          if (psvId) {
            maxMarksMap[psvId] = (maxMarksMap[psvId] || 0) + Number(q.marks || 0);
          }
        }
      });

      (grpQRes.data || []).forEach((q) => {
        if (q.group_version_id) {
          const psvId = grpToPsv.get(q.group_version_id);
          if (psvId) {
            maxMarksMap[psvId] = (maxMarksMap[psvId] || 0) + Number(q.marks || 0);
          }
        }
      });
    }
  }

  // 3. Group attempts into sessions by assessment_event_id + start_time
  // Multi-subject attempts created in the same transaction share the exact same start_time.
  // Distinct repeat attempts have different start_times.
  const eventClustersMap = new Map<string, Map<string, AttemptRow[]>>();

  attempts.forEach((att) => {
    const asub = Array.isArray(att.assessment_subjects) ? att.assessment_subjects[0] : att.assessment_subjects;
    if (!asub) return;
    const event = Array.isArray(asub.assessment_events) ? asub.assessment_events[0] : asub.assessment_events;
    if (!event) return;

    const eventId = event.id;
    const startKey = att.start_time ? att.start_time.trim() : att.id;

    if (!eventClustersMap.has(eventId)) {
      eventClustersMap.set(eventId, new Map());
    }
    const sessionMap = eventClustersMap.get(eventId)!;
    if (sessionMap.has(startKey)) {
      sessionMap.get(startKey)!.push(att);
    } else {
      sessionMap.set(startKey, [att]);
    }
  });

  const historySessions: StudentExamHistorySession[] = [];

  // 4. Build session structures and calculate sequential attempt numbers per event
  for (const [, sessionMap] of eventClustersMap.entries()) {
    // Sort sessions for this event chronologically ascending by start_time to number attempts sequentially (1, 2, ... N)
    const sortedClusters = Array.from(sessionMap.entries())
      .sort(([keyA], [keyB]) => {
        const timeA = new Date(keyA).getTime() || 0;
        const timeB = new Date(keyB).getTime() || 0;
        return timeA - timeB;
      })
      .map(([, clusterRows]) => clusterRows);

    sortedClusters.forEach((clusterRows, idx) => {
      const sessionNumber = idx + 1;
      const firstAtt = clusterRows[0];
      const asub = Array.isArray(firstAtt.assessment_subjects) ? firstAtt.assessment_subjects[0] : firstAtt.assessment_subjects;
      const event = Array.isArray(asub.assessment_events) ? asub.assessment_events[0] : asub.assessment_events;
      const typeObj = Array.isArray(event.assessment_types) ? event.assessment_types[0] : event.assessment_types;

      const isTest = firstAtt.is_test || event.assignment_type === "TEST";

      let latestCompletedAt: string | null = null;
      let sessionOverallScore = 0;
      let sessionOverallMaxMarks = 0;
      let allEvaluated = true;

      const subjects: StudentExamHistorySubject[] = clusterRows.map((att) => {
        const sAsub = Array.isArray(att.assessment_subjects) ? att.assessment_subjects[0] : att.assessment_subjects;
        const sub = Array.isArray(sAsub.subjects) ? sAsub.subjects[0] : sAsub.subjects;
        const res = Array.isArray(att.results) ? att.results[0] : att.results;

        const score = Number(res?.score || 0);
        const maxMarks = maxMarksMap[att.paper_set_version_id] || 0;
        const percentage = maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(1)) : null;
        const status = res?.status || "Pending Review";

        if (status !== "Evaluated") {
          allEvaluated = false;
        }

        const compAt = res?.evaluated_at || att.end_time || att.start_time;
        if (compAt && (!latestCompletedAt || new Date(compAt) > new Date(latestCompletedAt))) {
          latestCompletedAt = compAt;
        }

        sessionOverallScore += score;
        sessionOverallMaxMarks += maxMarks;

        const blockedReason = reviewBlockedReason(isTest, status, event.status);
        const canReview = !blockedReason;

        return {
          attemptId: att.id,
          subjectId: sub?.id || "",
          subjectName: sub?.name || "Subject",
          subjectCode: sub?.code || "",
          score,
          maxMarks,
          percentage,
          status,
          canReviewAnswers: canReview,
          reviewBlockedReason: blockedReason,
        };
      });

      const sessionStatus: "Evaluated" | "Pending Review" = allEvaluated ? "Evaluated" : "Pending Review";
      const overallPercentage =
        sessionOverallMaxMarks > 0
          ? Number(((sessionOverallScore / sessionOverallMaxMarks) * 100).toFixed(1))
          : null;

      const sessionBlockedReason = reviewBlockedReason(isTest, sessionStatus, event.status);
      const sessionCanReview = !sessionBlockedReason;

      historySessions.push({
        sessionId: `${event.id}::${firstAtt.start_time || firstAtt.id}`,
        assessmentId: event.id,
        assessmentTitle: event.title,
        assessmentTypeName: typeObj?.name || (isTest ? "Test Assignment" : "Standard Exam"),
        assignmentType: isTest ? "TEST" : "PRODUCTION",
        isTest,
        attemptNumber: isTest ? sessionNumber : 1,
        completedAt: latestCompletedAt,
        overallScore: sessionOverallScore,
        overallMaxMarks: sessionOverallMaxMarks,
        overallPercentage,
        status: sessionStatus,
        canReviewAnswers: sessionCanReview,
        reviewBlockedReason: sessionBlockedReason,
        primaryAttemptId: firstAtt.id,
        subjects,
      });
    });
  }

  // 5. Sort sessions descending by completion date (most recent first)
  return historySessions.sort((a, b) => {
    const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return timeB - timeA;
  });
}

export async function getStudentAttemptReviewAction(attemptId: string): Promise<StudentAttemptReviewResult> {
  return hideAnswerKeys(await loadAttemptReview(attemptId));
}

export async function revealCorrectAnswerAction(attemptId: string, questionId: string): Promise<QuestionReviewItem> {
  const review = await loadAttemptReview(attemptId);
  const question = review.allowed && review.questions?.find(q => q.id === questionId);
  if (!question) throw new Error(review.reason || "Question unavailable");
  return question;
}
