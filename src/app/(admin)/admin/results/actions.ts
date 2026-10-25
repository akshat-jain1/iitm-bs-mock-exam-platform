"use server";

import { IntegrityStatus, getIntegrityStatus } from "@/lib/exam-integrity/config";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { getOrLoadPaperStructures } from "@/lib/exam/paper-cache";

export interface ExamResultsSummary {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  assessment_type_name: string;
  subject_count: number;
  total_submissions: number;
  unique_students: number;
  created_at: string;
}

export interface SubjectConfig {
  assessment_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  paper_set_version_id: string;
  max_marks: number;
}

export interface IntegrityEventItem {
  id: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface StudentIntegritySummary {
  fullscreen_exits: number;
  tab_window_leaves: number;
  copy_paste_attempts: number;
  total_events: number;
  status: IntegrityStatus;
  events: IntegrityEventItem[];
}

export interface StudentResultEntry {
  attempt_id: string;
  attempt_number: number;
  student_id: string;
  student_name: string;
  student_email: string;
  assessment_subject_id: string;
  subject_id: string;
  subject_name: string;
  attempt_status: string;
  start_time: string;
  end_time: string | null;
  score: number | null;
  result_status: string | null;
  evaluated_at: string | null;
  integrity_summary?: StudentIntegritySummary;
}

export interface ExamDetailedResults {
  exam: {
    id: string;
    title: string;
    status: string;
    scheduled_start: string | null;
    assessment_type_name: string;
    assignment_type?: 'PRODUCTION' | 'TEST';
  };
  subjects: SubjectConfig[];
  entries: StudentResultEntry[];
}


export async function getExamResultsListAction(): Promise<ExamResultsSummary[]> {
  const { supabase } = await verifyAdmin();

  // 1. Fetch Assessment Events, Assessment Subjects, and Attempts concurrently
  const [eventsRes, subjectsRes, attemptsRes] = await Promise.all([
    supabase
      .from("assessment_events")
      .select(`
        id,
        title,
        status,
        scheduled_start,
        created_at,
        assignment_type,
        assessment_types ( name )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("assessment_subjects")
      .select("id, assessment_event_id"),
    supabase
      .from("attempts")
      .select("id, student_id, assessment_subject_id, is_test"),
  ]);

  if (eventsRes.error) {
    const errPayload = {
      code: eventsRes.error.code,
      message: eventsRes.error.message,
      details: eventsRes.error.details,
      hint: eventsRes.error.hint,
    };
    console.error("Error fetching assessment events for results:", errPayload);
    throw new Error(`Error fetching assessment events for results: [${errPayload.code}] ${errPayload.message}`);
  }

  if (subjectsRes.error) {
    const errPayload = {
      code: subjectsRes.error.code,
      message: subjectsRes.error.message,
      details: subjectsRes.error.details,
      hint: subjectsRes.error.hint,
    };
    console.error("Error fetching assessment subjects for results:", errPayload);
    throw new Error(`Error fetching assessment subjects for results: [${errPayload.code}] ${errPayload.message}`);
  }

  if (attemptsRes.error) {
    const errPayload = {
      code: attemptsRes.error.code,
      message: attemptsRes.error.message,
      details: attemptsRes.error.details,
      hint: attemptsRes.error.hint,
    };
    console.error("Error fetching attempts for results:", errPayload);
    throw new Error(`Error fetching attempts for results: [${errPayload.code}] ${errPayload.message}`);
  }

  const events = eventsRes.data || [];
  const assessmentSubjects = subjectsRes.data || [];
  const attempts = attemptsRes.data || [];

  // 2. Count subjects per event and map event assignment types
  const eventSubjCount: Record<string, number> = {};
  const asubToEventMap: Record<string, string> = {};
  const eventAssignmentTypeMap: Record<string, string> = {};

  (events || []).forEach((e) => {
    eventAssignmentTypeMap[e.id] = e.assignment_type || 'PRODUCTION';
  });

  (assessmentSubjects || []).forEach((asub) => {
    eventSubjCount[asub.assessment_event_id] = (eventSubjCount[asub.assessment_event_id] || 0) + 1;
    asubToEventMap[asub.id] = asub.assessment_event_id;
  });

  // 3. Count submissions and unique students with strict isolation
  const eventSubmissionsCount: Record<string, number> = {};
  const eventStudentsMap: Record<string, Set<string>> = {};

  (attempts || []).forEach((att) => {
    const eventId = asubToEventMap[att.assessment_subject_id];
    if (eventId) {
      const isProductionEvent = eventAssignmentTypeMap[eventId] === 'PRODUCTION';
      // For production exams, only count attempts with is_test = false
      if (isProductionEvent && att.is_test) return;

      eventSubmissionsCount[eventId] = (eventSubmissionsCount[eventId] || 0) + 1;
      if (!eventStudentsMap[eventId]) eventStudentsMap[eventId] = new Set();
      eventStudentsMap[eventId].add(att.student_id);
    }
  });

  return events.map((e) => {
    const typeObj = Array.isArray(e.assessment_types) ? e.assessment_types[0] : e.assessment_types;
    return {
      id: e.id,
      title: e.title,
      status: e.status,
      scheduled_start: e.scheduled_start,
      assessment_type_name: typeObj?.name || "Standard Exam",
      assignment_type: e.assignment_type || "PRODUCTION",
      subject_count: eventSubjCount[e.id] || 0,
      total_submissions: eventSubmissionsCount[e.id] || 0,
      unique_students: eventStudentsMap[e.id]?.size || 0,
      created_at: e.created_at,
    };
  });
}

export async function getExamDetailedResultsAction(examId: string): Promise<ExamDetailedResults | null> {
  const { supabase } = await verifyAdmin();

  // Use service role client if available for high-throughput administrative data aggregation
  const serviceClient = getServiceClientOrNull();
  const queryClient = (serviceClient || supabase) as unknown as typeof supabase;

  // 1. Fetch Exam Metadata & Assessment Subjects in parallel
  const [eventRes, asubsRes] = await Promise.all([
    queryClient
      .from("assessment_events")
      .select(`
        id,
        title,
        status,
        scheduled_start,
        assignment_type,
        assessment_types ( name )
      `)
      .eq("id", examId)
      .single(),
    queryClient
      .from("assessment_subjects")
      .select(`
        id,
        assessment_event_id,
        paper_set_version_id,
        subject_id,
        subjects!inner ( id, name, code )
      `)
      .eq("assessment_event_id", examId),
  ]);

  if (eventRes.error || !eventRes.data) {
    console.error("Exam not found:", eventRes.error);
    return null;
  }

  const event = eventRes.data;
  const typeObj = Array.isArray(event.assessment_types) ? event.assessment_types[0] : event.assessment_types;

  if (asubsRes.error || !asubsRes.data) {
    console.error("Error fetching assessment subjects:", asubsRes.error);
    return null;
  }

  const asubs = asubsRes.data;
  const asubIds = asubs.map((s) => s.id);
  const psvIds = Array.from(new Set(asubs.map((s) => s.paper_set_version_id)));

  // 2. Fetch Attempts with strict production isolation
  let attemptsQuery = queryClient
    .from("attempts")
    .select(`
      id,
      attempt_number,
      student_id,
      assessment_subject_id,
      paper_set_version_id,
      status,
      start_time,
      end_time,
      is_test,
      users!inner ( id, name, email ),
      results ( score, max_marks, status, evaluated_at )
    `)
    .in("assessment_subject_id", asubIds);

  if (event.assignment_type === "PRODUCTION") {
    attemptsQuery = attemptsQuery.eq("is_test", false);
  }

  const attemptsRes = asubIds.length > 0
    ? await attemptsQuery
    : { data: [], error: null };

  if (attemptsRes.error) {
    console.error("Error fetching attempts for results:", attemptsRes.error);
    return null;
  }

  const attempts = attemptsRes.data || [];

  // 3. Resolve Authoritative Question Marks: use stored results.max_marks where available
  const maxMarksMap: Record<string, number> = {};
  const missingPsvIds = new Set<string>();

  attempts.forEach((att) => {
    const res = Array.isArray(att.results) ? att.results[0] : att.results;
    if (res && res.max_marks != null) {
      maxMarksMap[att.paper_set_version_id] = Number(res.max_marks);
    }
  });

  psvIds.forEach((psvId) => {
    if (psvId && maxMarksMap[psvId] === undefined) {
      missingPsvIds.add(psvId);
    }
  });

  if (missingPsvIds.size > 0) {
    const fallbackPsvIds = Array.from(missingPsvIds);
    const { data: secVers } = await queryClient
      .from("section_versions")
      .select("id, paper_set_version_id")
      .in("paper_set_version_id", fallbackPsvIds);

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
          : Promise.resolve({ data: [], error: null }),
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

  const subjectsConfig: SubjectConfig[] = asubs.map((asub) => {
    const sObj = Array.isArray(asub.subjects) ? asub.subjects[0] : asub.subjects;
    return {
      assessment_subject_id: asub.id,
      subject_id: asub.subject_id,
      subject_name: sObj?.name || "Unknown Subject",
      subject_code: sObj?.code || "",
      paper_set_version_id: asub.paper_set_version_id,
      max_marks: maxMarksMap[asub.paper_set_version_id] || 0,
    };
  }).sort((a, b) => a.subject_name.localeCompare(b.subject_name));

  // 4. Map Attempts & Results into StudentResultEntry array
  interface AttemptRecord {
    id: string;
    attempt_number?: number;
    student_id: string;
    assessment_subject_id: string;
    status: string;
    start_time: string;
    end_time: string | null;
    users: { name: string; email: string } | { name: string; email: string }[];
    results:
      | { score: number | string; status: string; evaluated_at: string | null }
      | { score: number | string; status: string; evaluated_at: string | null }[]
      | null;
  }

  const asubLookup = new Map<SubjectConfig["assessment_subject_id"], SubjectConfig>();
  subjectsConfig.forEach((s) => asubLookup.set(s.assessment_subject_id, s));

  const attemptIds = (attempts as { id: string }[]).map((a) => a.id);
  const integrityMap = new Map<string, IntegrityEventItem[]>();

  if (attemptIds.length > 0) {
    const { data: integrityData, error: integrityErr } = await queryClient
      .from("exam_integrity_events")
      .select("id, attempt_id, event_type, metadata, created_at")
      .in("attempt_id", attemptIds)
      .order("created_at", { ascending: true });

    if (!integrityErr && integrityData) {
      integrityData.forEach((ev: { id: string; attempt_id: string; event_type: string; metadata?: Record<string, unknown>; created_at: string }) => {
        if (!integrityMap.has(ev.attempt_id)) {
          integrityMap.set(ev.attempt_id, []);
        }
        integrityMap.get(ev.attempt_id)!.push({
          id: ev.id,
          event_type: ev.event_type,
          metadata: ev.metadata,
          created_at: ev.created_at,
        });
      });
    }
  }

  const entries: StudentResultEntry[] = (attempts as unknown as AttemptRecord[]).map((att) => {
    const sProfile = Array.isArray(att.users) ? att.users[0] : att.users;
    const resObj = Array.isArray(att.results) ? att.results[0] : att.results;
    const asubInfo = asubLookup.get(att.assessment_subject_id);

    const evs = integrityMap.get(att.id) || [];
    const fullscreen_exits = evs.filter((e) => e.event_type === "fullscreen_exit").length;
    const tab_window_leaves = evs.filter((e) => e.event_type === "visibility_lost" || e.event_type === "window_blur").length;
    const copy_paste_attempts = evs.filter((e) =>
      e.event_type === "copy_attempt" ||
      e.event_type === "paste_attempt" ||
      e.event_type === "cut_attempt"
    ).length;
    const total_events = evs.length;
    const status = getIntegrityStatus(total_events);

    return {
      attempt_id: att.id,
      attempt_number: att.attempt_number || 1,
      student_id: att.student_id,
      student_name: sProfile?.name || "Unknown Student",
      student_email: sProfile?.email || "",
      assessment_subject_id: att.assessment_subject_id,
      subject_id: asubInfo?.subject_id || "",
      subject_name: asubInfo?.subject_name || "",
      attempt_status: att.status,
      start_time: att.start_time,
      end_time: att.end_time,
      score: resObj ? Number(resObj.score) : null,
      result_status: resObj ? resObj.status : null,
      evaluated_at: resObj ? resObj.evaluated_at : null,
      integrity_summary: {
        fullscreen_exits,
        tab_window_leaves,
        copy_paste_attempts,
        total_events,
        status,
        events: evs,
      },
    };
  });

  return {
    exam: {
      id: event.id,
      title: event.title,
      status: event.status,
      scheduled_start: event.scheduled_start,
      assessment_type_name: typeObj?.name || "Standard Exam",
      assignment_type: (event.assignment_type as "PRODUCTION" | "TEST") || "PRODUCTION",
    },
    subjects: subjectsConfig,
    entries,
  };
}

// ------------------------------------------------------------------------------
// PHASE 3: ADMIN QUESTION-WISE RESULTS
// ------------------------------------------------------------------------------

export type QuestionCorrectnessStatus =
  | "CORRECT"
  | "INCORRECT"
  | "UNANSWERED"
  | "PENDING"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export interface QuestionColumnMetadata {
  id: string;
  sequenceNumber: number;
  sourceQuestionNumber?: number;
  type: "MCQ" | "MSQ" | "NUMERICAL";
  marks: number;
}

export interface QuestionAttemptStatus {
  status: QuestionCorrectnessStatus;
  marksAwarded: number;
  maxMarks: number;
  questionType: "MCQ" | "MSQ" | "NUMERICAL";
  detail?: string;
}

export interface SubjectQuestionWiseData {
  assessmentSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  canonicalPaperSetVersionId: string;
  questions: QuestionColumnMetadata[];
  attemptQuestionStatuses: Record<string, Record<string, QuestionAttemptStatus>>;
  attemptPaperVersionInfo: Record<string, { isDifferentVersion: boolean; paperSetVersionId: string }>;
}

export async function getSubjectQuestionWiseResultsAction(
  examId: string,
  assessmentSubjectId: string
): Promise<SubjectQuestionWiseData | null> {
  const { supabase } = await verifyAdmin();

  const serviceClient = getServiceClientOrNull();
  const queryClient = (serviceClient || supabase) as unknown as typeof supabase;

  // 1. Authoritative check: ensure assessment subject exists and belongs to the given exam
  const { data: asub, error: asubErr } = await queryClient
    .from("assessment_subjects")
    .select(`
      id,
      assessment_event_id,
      subject_id,
      paper_set_version_id,
      subjects!inner ( id, name, code ),
      assessment_events!inner ( id, assignment_type, status )
    `)
    .eq("id", assessmentSubjectId)
    .eq("assessment_event_id", examId)
    .single();

  if (asubErr || !asub) {
    console.error("Assessment subject not found or does not belong to exam:", asubErr);
    return null;
  }

  interface AsubJoined {
    id: string;
    assessment_event_id: string;
    subject_id: string;
    paper_set_version_id: string;
    subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[];
    assessment_events: { id: string; assignment_type: string; status: string } | { id: string; assignment_type: string; status: string }[];
  }

  const asubRow = asub as unknown as AsubJoined;
  const eventObj = Array.isArray(asubRow.assessment_events) ? asubRow.assessment_events[0] : asubRow.assessment_events;
  const subjObj = Array.isArray(asubRow.subjects) ? asubRow.subjects[0] : asubRow.subjects;
  const isProductionEvent = eventObj?.assignment_type === "PRODUCTION";
  const canonicalPsvId = asubRow.paper_set_version_id;

  if (!canonicalPsvId) {
    console.error("No paper_set_version_id configured on assessment subject", assessmentSubjectId);
    return null;
  }

  // 2. Fetch attempts for this assessment subject with production isolation
  let attemptsQuery = queryClient
    .from("attempts")
    .select(`
      id,
      attempt_number,
      student_id,
      paper_set_version_id,
      status,
      is_test,
      results (
        score,
        status,
        evaluated_at
      )
    `)
    .eq("assessment_subject_id", assessmentSubjectId);

  if (isProductionEvent) {
    attemptsQuery = attemptsQuery.eq("is_test", false);
  }

  const { data: rawAttempts, error: attemptsErr } = await attemptsQuery;
  if (attemptsErr) {
    console.error("Error fetching attempts for question-wise results:", attemptsErr);
    return null;
  }

  interface AttemptRecord {
    id: string;
    attempt_number: number | null;
    student_id: string;
    paper_set_version_id: string;
    status: string;
    is_test: boolean;
    results: { score: number | string; status: string; evaluated_at: string | null } | { score: number | string; status: string; evaluated_at: string | null }[] | null;
  }

  const attempts = (rawAttempts || []) as unknown as AttemptRecord[];

  // 3. Identify all distinct paper set version IDs involved
  const distinctPsvIds = new Set<string>();
  distinctPsvIds.add(canonicalPsvId);
  attempts.forEach((att) => {
    if (att.paper_set_version_id) {
      distinctPsvIds.add(att.paper_set_version_id);
    }
  });

  // 4. Batch-load cached paper structures
  const paperMap = await getOrLoadPaperStructures(Array.from(distinctPsvIds), queryClient);
  const canonicalPaper = paperMap.get(canonicalPsvId);

  if (!canonicalPaper) {
    console.error("Canonical paper structure not found for", canonicalPsvId);
    return null;
  }

  const canonicalQuestions: QuestionColumnMetadata[] = canonicalPaper.questions.map((q, idx) => ({
    id: q.id,
    sequenceNumber: idx + 1,
    sourceQuestionNumber: q.sourceQuestionNumber,
    type: q.type as "MCQ" | "MSQ" | "NUMERICAL",
    marks: Number(q.marks),
  }));

  // 5. Collect all question version IDs across all loaded papers
  const allQuestionIds = new Set<string>();
  paperMap.forEach((p) => {
    p.questions.forEach((q) => allQuestionIds.add(q.id));
  });

  // 6. Handle cross-version question mapping via cloned_from_id provenance
  const crossVersionQuestionMap = new Map<string, Map<string, string | null>>();

  if (distinctPsvIds.size > 1 && allQuestionIds.size > 0) {
    const { data: qVers, error: qVersErr } = await queryClient
      .from("question_versions")
      .select("id, cloned_from_id")
      .in("id", Array.from(allQuestionIds));

    if (qVersErr) {
      console.error("Error fetching question versions provenance:", qVersErr.message);
      return null;
    }

    const qToClonedFrom = new Map<string, string>();
    (qVers || []).forEach((qv: { id: string; cloned_from_id: string | null }) => {
      if (qv.cloned_from_id) qToClonedFrom.set(qv.id, qv.cloned_from_id);
    });

    const canonicalClonedCount = new Map<string, number>();
    const canonicalByClonedFrom = new Map<string, string>();
    canonicalPaper.questions.forEach((q) => {
      const cfId = qToClonedFrom.get(q.id);
      if (cfId) {
        canonicalClonedCount.set(cfId, (canonicalClonedCount.get(cfId) || 0) + 1);
        canonicalByClonedFrom.set(cfId, q.id);
      }
    });

    paperMap.forEach((paper, psvId) => {
      if (psvId === canonicalPsvId) return;
      const mapping = new Map<string, string | null>();

      const secClonedCount = new Map<string, number>();
      const secByClonedFrom = new Map<string, string>();
      paper.questions.forEach((q) => {
        const cfId = qToClonedFrom.get(q.id);
        if (cfId) {
          secClonedCount.set(cfId, (secClonedCount.get(cfId) || 0) + 1);
          secByClonedFrom.set(cfId, q.id);
        }
      });

      canonicalPaper.questions.forEach((cq) => {
        const cfId = qToClonedFrom.get(cq.id);
        if (
          cfId &&
          canonicalClonedCount.get(cfId) === 1 &&
          secClonedCount.get(cfId) === 1
        ) {
          mapping.set(cq.id, secByClonedFrom.get(cfId) || null);
        } else {
          mapping.set(cq.id, null);
        }
      });

      crossVersionQuestionMap.set(psvId, mapping);
    });
  }

  // 7. Parallel batch queries for answer keys with explicit error verification
  const attemptIds = attempts.map((a) => a.id);
  const allQIdsArray = Array.from(allQuestionIds);

  const [mcqKeysRes, numKeysRes] = await Promise.all([
    allQIdsArray.length > 0
      ? queryClient
          .from("eval_mcq_msq_versions")
          .select("question_version_id, correct_option_version_id")
          .in("question_version_id", allQIdsArray)
      : Promise.resolve({ data: [], error: null }),
    allQIdsArray.length > 0
      ? queryClient
          .from("eval_numeric_versions")
          .select("question_version_id, mode, exact_val, min_val, max_val")
          .in("question_version_id", allQIdsArray)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (mcqKeysRes.error) {
    console.error("Error fetching MCQ/MSQ answer keys:", mcqKeysRes.error.message);
    return null;
  }
  if (numKeysRes.error) {
    console.error("Error fetching Numerical answer keys:", numKeysRes.error.message);
    return null;
  }

  // 8. Robust batching and range-paginated retrieval of student responses
  // Prevents oversized PostgREST URLs (HTTP 414) and silent PostgREST max_rows truncation.
  const responseMap = new Map<string, unknown>();

  if (attemptIds.length > 0 && allQIdsArray.length > 0) {
    const ATTEMPT_BATCH_SIZE = 50;
    const RESPONSE_PAGE_SIZE = 1000;

    const attemptBatches: string[][] = [];
    for (let i = 0; i < attemptIds.length; i += ATTEMPT_BATCH_SIZE) {
      attemptBatches.push(attemptIds.slice(i, i + ATTEMPT_BATCH_SIZE));
    }

    // Process attempt batches sequentially to bound concurrent database requests
    for (const batch of attemptBatches) {
      let page = 0;
      while (true) {
        const from = page * RESPONSE_PAGE_SIZE;
        const to = from + RESPONSE_PAGE_SIZE - 1;

        const { data: pageRows, error: pageErr } = await queryClient
          .from("responses")
          .select("attempt_id, question_version_id, data")
          .in("attempt_id", batch)
          .in("question_version_id", allQIdsArray)
          .order("attempt_id", { ascending: true })
          .order("question_version_id", { ascending: true })
          .range(from, to);

        if (pageErr) {
          console.error("Error fetching response batch page:", pageErr.message);
          return null;
        }

        const rows = (pageRows || []) as { attempt_id: string; question_version_id: string; data: unknown }[];
        for (const r of rows) {
          responseMap.set(`${r.attempt_id}::${r.question_version_id}`, r.data);
        }

        // If the page returned fewer rows than requested, this batch is exhausted
        if (rows.length < RESPONSE_PAGE_SIZE) {
          break;
        }

        // Exact-boundary case: page is completely full; continue to next range
        page++;
      }
    }
  }

  // Index MCQ/MSQ answer keys
  const mcqKeyMap = new Map<string, string[]>();
  (mcqKeysRes.data || []).forEach((r: { question_version_id: string; correct_option_version_id: string }) => {
    const arr = mcqKeyMap.get(r.question_version_id) || [];
    arr.push(r.correct_option_version_id);
    mcqKeyMap.set(r.question_version_id, arr);
  });

  // Index Numerical answer keys
  interface NumKeyRow {
    question_version_id: string;
    mode: "EXACT" | "RANGE";
    exact_val: number | null;
    min_val: number | null;
    max_val: number | null;
  }
  const numKeyMap = new Map<string, NumKeyRow>();
  (numKeysRes.data || []).forEach((r: unknown) => {
    const row = r as NumKeyRow;
    numKeyMap.set(row.question_version_id, row);
  });

  // 8. Derive question correctness for each attempt and question
  const attemptQuestionStatuses: Record<string, Record<string, QuestionAttemptStatus>> = {};
  const attemptPaperVersionInfo: Record<string, { isDifferentVersion: boolean; paperSetVersionId: string }> = {};

  attempts.forEach((att) => {
    const resObj = Array.isArray(att.results) ? att.results[0] : att.results;
    const isAttemptFinished = att.status === "Completed" || att.status === "Submitted";
    const isEvaluated = isAttemptFinished && resObj?.status === "Evaluated";

    const isDifferentVersion = !!att.paper_set_version_id && att.paper_set_version_id !== canonicalPsvId;
    attemptPaperVersionInfo[att.id] = {
      isDifferentVersion,
      paperSetVersionId: att.paper_set_version_id || canonicalPsvId,
    };

    const statusesForAttempt: Record<string, QuestionAttemptStatus> = {};

    canonicalQuestions.forEach((canonicalQ) => {
      let targetQVerId: string | null = canonicalQ.id;

      if (isDifferentVersion) {
        const mapping = crossVersionQuestionMap.get(att.paper_set_version_id);
        targetQVerId = mapping ? mapping.get(canonicalQ.id) ?? null : null;

        if (!targetQVerId) {
          statusesForAttempt[canonicalQ.id] = {
            status: "NOT_APPLICABLE",
            marksAwarded: 0,
            maxMarks: canonicalQ.marks,
            questionType: canonicalQ.type,
            detail: "Question not present in paper version taken",
          };
          return;
        }
      }

      // Check answer key completeness safeguards
      let isKeyComplete = false;
      let correctOptions: string[] = [];
      let numKey: NumKeyRow | undefined = undefined;

      if (canonicalQ.type === "MCQ") {
        correctOptions = mcqKeyMap.get(targetQVerId) || [];
        isKeyComplete = correctOptions.length === 1;
      } else if (canonicalQ.type === "MSQ") {
        correctOptions = mcqKeyMap.get(targetQVerId) || [];
        isKeyComplete = correctOptions.length >= 2;
      } else if (canonicalQ.type === "NUMERICAL") {
        numKey = numKeyMap.get(targetQVerId);
        isKeyComplete = !!numKey && (
          (numKey.mode === "EXACT" && numKey.exact_val !== null) ||
          (numKey.mode === "RANGE" && numKey.min_val !== null && numKey.max_val !== null)
        );
      }

      if (!isKeyComplete) {
        statusesForAttempt[canonicalQ.id] = {
          status: "PENDING",
          marksAwarded: 0,
          maxMarks: canonicalQ.marks,
          questionType: canonicalQ.type,
          detail: "Answer key incomplete or unverified",
        };
        return;
      }

      if (!isEvaluated) {
        statusesForAttempt[canonicalQ.id] = {
          status: "PENDING",
          marksAwarded: 0,
          maxMarks: canonicalQ.marks,
          questionType: canonicalQ.type,
          detail: "Evaluation pending faculty review",
        };
        return;
      }

      // Response lookup & verification
      const rawResp = responseMap.get(`${att.id}::${targetQVerId}`);
      let parsedResp: { selected_option_id?: string; selected_option_ids?: string[]; value?: string | number } | null = null;
      if (rawResp !== null && rawResp !== undefined) {
        if (typeof rawResp === "string") {
          try { parsedResp = JSON.parse(rawResp); } catch {}
        } else if (typeof rawResp === "object") {
          parsedResp = rawResp as { selected_option_id?: string; selected_option_ids?: string[]; value?: string | number };
        }
      }

      if (canonicalQ.type === "MCQ") {
        const selectedOptionId = parsedResp?.selected_option_id;
        if (!selectedOptionId) {
          statusesForAttempt[canonicalQ.id] = {
            status: "UNANSWERED",
            marksAwarded: 0,
            maxMarks: canonicalQ.marks,
            questionType: "MCQ",
            detail: "Unanswered",
          };
        } else {
          const isCorrect = selectedOptionId === correctOptions[0];
          statusesForAttempt[canonicalQ.id] = {
            status: isCorrect ? "CORRECT" : "INCORRECT",
            marksAwarded: isCorrect ? canonicalQ.marks : 0,
            maxMarks: canonicalQ.marks,
            questionType: "MCQ",
            detail: isCorrect ? "Correct" : "Incorrect",
          };
        }
      } else if (canonicalQ.type === "MSQ") {
        const selectedIds = Array.isArray(parsedResp?.selected_option_ids) ? parsedResp.selected_option_ids : [];
        if (selectedIds.length === 0) {
          statusesForAttempt[canonicalQ.id] = {
            status: "UNANSWERED",
            marksAwarded: 0,
            maxMarks: canonicalQ.marks,
            questionType: "MSQ",
            detail: "Unanswered",
          };
        } else {
          const correctSet = new Set(correctOptions);
          const studentSet = new Set(selectedIds);
          const isCorrect =
            correctSet.size > 0 &&
            studentSet.size === correctSet.size &&
            [...studentSet].every((id) => correctSet.has(id));

          statusesForAttempt[canonicalQ.id] = {
            status: isCorrect ? "CORRECT" : "INCORRECT",
            marksAwarded: isCorrect ? canonicalQ.marks : 0,
            maxMarks: canonicalQ.marks,
            questionType: "MSQ",
            detail: isCorrect ? "Correct" : "Incorrect (exact set match required)",
          };
        }
      } else if (canonicalQ.type === "NUMERICAL") {
        const rawVal = parsedResp?.value;
        const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
        if (!hasVal) {
          statusesForAttempt[canonicalQ.id] = {
            status: "UNANSWERED",
            marksAwarded: 0,
            maxMarks: canonicalQ.marks,
            questionType: "NUMERICAL",
            detail: "Unanswered",
          };
        } else {
          const studentValNum = Number(String(rawVal).trim());
          if (isNaN(studentValNum)) {
            statusesForAttempt[canonicalQ.id] = {
              status: "INCORRECT",
              marksAwarded: 0,
              maxMarks: canonicalQ.marks,
              questionType: "NUMERICAL",
              detail: "Invalid numerical format",
            };
          } else {
            let isCorrect = false;
            if (numKey!.mode === "EXACT" && numKey!.exact_val !== null) {
              isCorrect = studentValNum === Number(numKey!.exact_val);
            } else if (numKey!.mode === "RANGE" && numKey!.min_val !== null && numKey!.max_val !== null) {
              isCorrect = studentValNum >= Number(numKey!.min_val) && studentValNum <= Number(numKey!.max_val);
            }

            statusesForAttempt[canonicalQ.id] = {
              status: isCorrect ? "CORRECT" : "INCORRECT",
              marksAwarded: isCorrect ? canonicalQ.marks : 0,
              maxMarks: canonicalQ.marks,
              questionType: "NUMERICAL",
              detail: isCorrect ? "Correct" : "Incorrect",
            };
          }
        }
      }
    });

    attemptQuestionStatuses[att.id] = statusesForAttempt;
  });

  return {
    assessmentSubjectId,
    subjectId: asubRow.subject_id,
    subjectName: subjObj?.name || "Subject",
    subjectCode: subjObj?.code || "",
    canonicalPaperSetVersionId: canonicalPsvId,
    questions: canonicalQuestions,
    attemptQuestionStatuses,
    attemptPaperVersionInfo,
  };
}
