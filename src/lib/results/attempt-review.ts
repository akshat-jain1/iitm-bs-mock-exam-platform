import "server-only";
import { reviewBlockedReason } from "./release";
import type { StudentAttemptReviewResult, QuestionReviewItem, OptionReview, SiblingSubjectReview } from "@/app/(student)/student/(portal)/results/actions";
import { canAccessAssignment } from "@/lib/assessment-access";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { isAllowedScalerEmail } from "@/lib/auth/config";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { getOrLoadPaperStructures, collectStoragePathsFromStructures, signPaperStoragePaths, buildExamFromStructure, applySignedUrlsToExam } from "@/lib/exam/paper-cache";
export async function loadAttemptReview(attemptId: string): Promise<StudentAttemptReviewResult> {
  const user = await getCachedUser();
  if (!user || !user.email) {
    return { allowed: false, reason: "Unauthorized: Authentication required" };
  }

  if (!isAllowedScalerEmail(user.email)) {
    return { allowed: false, reason: "Unauthorized: Access restricted to @sst.scaler.com email addresses" };
  }

  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) {
    return { allowed: false, reason: "Service role client unavailable" };
  }

  // 1. Fetch Attempt with strict student ownership verification
  const { data: attempt, error: attemptError } = await serviceClient
    .from("attempts")
    .select(`
      id,
      student_id,
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
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    return { allowed: false, reason: "Attempt not found" };
  }

  // Ownership verification
  if (attempt.student_id !== user.id) {
    return { allowed: false, reason: "Unauthorized: You do not have permission to view this attempt" };
  }

  // Completed status verification
  if (attempt.status !== "Completed" && attempt.status !== "Submitted") {
    return { allowed: false, reason: "This attempt has not been completed" };
  }

  interface SingleAttemptRow {
    id: string;
    student_id: string;
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

  const attRow = attempt as unknown as SingleAttemptRow;
  const asub = Array.isArray(attRow.assessment_subjects) ? attRow.assessment_subjects[0] : attRow.assessment_subjects;
  const event = Array.isArray(asub.assessment_events) ? asub.assessment_events[0] : asub.assessment_events;
  const sub = Array.isArray(asub.subjects) ? asub.subjects[0] : asub.subjects;
  const res = Array.isArray(attRow.results) ? attRow.results[0] : attRow.results;
  const typeObj = Array.isArray(event.assessment_types) ? event.assessment_types[0] : event.assessment_types;

  const isTest = attRow.is_test || event.assignment_type === "TEST";
  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  if (!canAccessAssignment(role, event.assignment_type, attRow.is_test)) {
    return { allowed: false, reason: "This paper is unavailable for your account" };
  }
  const resultStatus = res?.status || "Pending Review";

  // Authorize before loading any paper or key; all entry points reuse this loader.
  const blockedReason = reviewBlockedReason(isTest, resultStatus, event.status);
  if (blockedReason) return { allowed: false, reason: blockedReason };

  // 3. Load immutable paper structure for the attempt's exact paper_set_version_id
  const paperMap = await getOrLoadPaperStructures([attRow.paper_set_version_id], serviceClient);
  const paperStructure = paperMap.get(attRow.paper_set_version_id);

  if (!paperStructure) {
    return { allowed: false, reason: "Published paper structure not found for this attempt" };
  }

  // 4. Batch-sign storage paths for images and clone exam structure
  const storagePaths = collectStoragePathsFromStructures([paperStructure]);
  const signedUrlMap = await signPaperStoragePaths(storagePaths, serviceClient, 10800);
  const exam = buildExamFromStructure(paperStructure, user, 0);
  applySignedUrlsToExam(exam, signedUrlMap);

  // 5. Batch-fetch student responses and answer keys in parallel
  const questionIds = exam.questions.map((q) => q.id);

  const [responsesRes, mcqEvalRes, numEvalRes, siblingsRes] = await Promise.all([
    serviceClient
      .from("responses")
      .select("question_version_id, data")
      .eq("attempt_id", attemptId),
    serviceClient
      .from("eval_mcq_msq_versions")
      .select("question_version_id, correct_option_version_id")
      .in("question_version_id", questionIds),
    serviceClient
      .from("eval_numeric_versions")
      .select("question_version_id, mode, exact_val, min_val, max_val")
      .in("question_version_id", questionIds),
    attRow.start_time
      ? serviceClient
          .from("attempts")
          .select(`
            id,
            assessment_subjects!inner (
              assessment_event_id,
              subjects!inner ( name, code )
            )
          `)
          .eq("student_id", user.id)
          .eq("start_time", attRow.start_time)
          .eq("assessment_subjects.assessment_event_id", event.id)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (responsesRes.error || mcqEvalRes.error || numEvalRes.error || siblingsRes.error) {
    return { allowed: false, reason: "Unable to load review. Please try again." };
  }

  // Index responses by question_version_id
  const responsesMap = new Map<string, unknown>();
  (responsesRes.data || []).forEach((r) => {
    responsesMap.set(r.question_version_id, r.data);
  });

  // Index MCQ/MSQ answer keys
  const mcqEvalMap = new Map<string, string[]>();
  (mcqEvalRes.data || []).forEach((row) => {
    const existing = mcqEvalMap.get(row.question_version_id) || [];
    existing.push(row.correct_option_version_id);
    mcqEvalMap.set(row.question_version_id, existing);
  });

  // Index numerical answer keys
  interface NumEvalRow {
    question_version_id: string;
    mode: "EXACT" | "RANGE";
    exact_val: number | null;
    min_val: number | null;
    max_val: number | null;
  }
  const numEvalMap = new Map<string, NumEvalRow>();
  (numEvalRes.data || []).forEach((row) => {
    numEvalMap.set(row.question_version_id, row as NumEvalRow);
  });

  // Sibling subjects in multi-subject session
  interface SiblingRow {
    id: string;
    assessment_subjects: {
      assessment_event_id: string;
      subjects: { name: string; code: string } | { name: string; code: string }[];
    } | {
      assessment_event_id: string;
      subjects: { name: string; code: string } | { name: string; code: string }[];
    }[];
  }
  let siblingSubjects: SiblingSubjectReview[] = [];
  const rawSiblings = (siblingsRes.data || []) as unknown as SiblingRow[];
  if (rawSiblings.length > 1) {
    siblingSubjects = rawSiblings.map((s) => {
      const sAsub = Array.isArray(s.assessment_subjects) ? s.assessment_subjects[0] : s.assessment_subjects;
      const sSub = Array.isArray(sAsub.subjects) ? sAsub.subjects[0] : sAsub.subjects;
      return {
        attemptId: s.id,
        subjectName: sSub?.name || "Subject",
        subjectCode: sSub?.code || "",
        isCurrent: s.id === attRow.id,
      };
    });
  }

  // 6. Assemble Question Review Items
  const questionReviewItems: QuestionReviewItem[] = exam.questions.map((q, idx) => {
    const rawResp = responsesMap.get(q.id);
    let parsedResp: { selected_option_id?: string; selected_option_ids?: string[]; value?: string | number } | null = null;
    if (rawResp !== null && rawResp !== undefined) {
      if (typeof rawResp === "string") {
        try { parsedResp = JSON.parse(rawResp); } catch {}
      } else if (typeof rawResp === "object") {
        parsedResp = rawResp as { selected_option_id?: string; selected_option_ids?: string[]; value?: string | number };
      }
    }

    if (q.type === "MCQ") {
      const correctOptionIds = mcqEvalMap.get(q.id) || [];
      const correctOptionId = correctOptionIds[0];
      const selectedOptionId = parsedResp?.selected_option_id;
      const isAnswered = !!selectedOptionId;
      const isCorrect = isAnswered && !!correctOptionId && selectedOptionId === correctOptionId;
      const status: "CORRECT" | "INCORRECT" | "UNANSWERED" = !isAnswered ? "UNANSWERED" : isCorrect ? "CORRECT" : "INCORRECT";
      const marksAwarded = isCorrect ? q.marks : 0;

      const options: OptionReview[] = (q.options || []).map((opt) => ({
        id: opt.id,
        text: opt.text,
        textHtml: opt.textHtml,
        imageUrl: opt.imageUrl,
        imageUrls: opt.imageUrls,
        images: opt.images,
        isStudentSelected: opt.id === selectedOptionId,
        isCorrect: opt.id === correctOptionId,
      }));

      return {
        id: q.id,
        sequenceNumber: idx + 1,
        sourceQuestionNumber: q.sourceQuestionNumber,
        type: "MCQ",
        text: q.text,
        textHtml: q.textHtml,
        marks: q.marks,
        marksAwarded,
        status,
        imageUrl: q.imageUrl,
        imageUrls: q.imageUrls,
        images: q.images,
        codeSnippet: q.codeSnippet,
        sectionId: q.sectionId,
        groupId: q.groupId,
        options,
      };
    } else if (q.type === "MSQ") {
      const correctOptionIds = mcqEvalMap.get(q.id) || [];
      const correctSet = new Set(correctOptionIds);
      const selectedIds = Array.isArray(parsedResp?.selected_option_ids) ? parsedResp.selected_option_ids : [];
      const isAnswered = selectedIds.length > 0;
      const studentSet = new Set(selectedIds);

      // Exact set equality (preserve IITM evaluation rules: no partial credit)
      const isCorrect =
        isAnswered &&
        correctSet.size > 0 &&
        studentSet.size === correctSet.size &&
        [...studentSet].every((id) => correctSet.has(id));

      const status: "CORRECT" | "INCORRECT" | "UNANSWERED" = !isAnswered ? "UNANSWERED" : isCorrect ? "CORRECT" : "INCORRECT";
      const marksAwarded = isCorrect ? q.marks : 0;

      const options: OptionReview[] = (q.options || []).map((opt) => ({
        id: opt.id,
        text: opt.text,
        textHtml: opt.textHtml,
        imageUrl: opt.imageUrl,
        imageUrls: opt.imageUrls,
        images: opt.images,
        isStudentSelected: studentSet.has(opt.id),
        isCorrect: correctSet.has(opt.id),
      }));

      return {
        id: q.id,
        sequenceNumber: idx + 1,
        sourceQuestionNumber: q.sourceQuestionNumber,
        type: "MSQ",
        text: q.text,
        textHtml: q.textHtml,
        marks: q.marks,
        marksAwarded,
        status,
        imageUrl: q.imageUrl,
        imageUrls: q.imageUrls,
        images: q.images,
        codeSnippet: q.codeSnippet,
        sectionId: q.sectionId,
        groupId: q.groupId,
        options,
      };
    } else {
      // NUMERICAL
      const numEval = numEvalMap.get(q.id);
      const rawVal = parsedResp?.value;
      const isAnswered = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
      const studentValStr = isAnswered ? String(rawVal).trim() : undefined;
      const studentValNum = isAnswered && studentValStr !== undefined ? Number(studentValStr) : NaN;

      let isCorrect = false;
      if (isAnswered && !isNaN(studentValNum) && numEval) {
        if (numEval.mode === "EXACT" && numEval.exact_val !== null) {
          isCorrect = studentValNum === Number(numEval.exact_val);
        } else if (numEval.mode === "RANGE" && numEval.min_val !== null && numEval.max_val !== null) {
          isCorrect = studentValNum >= Number(numEval.min_val) && studentValNum <= Number(numEval.max_val);
        }
      }

      const status: "CORRECT" | "INCORRECT" | "UNANSWERED" = !isAnswered ? "UNANSWERED" : isCorrect ? "CORRECT" : "INCORRECT";
      const marksAwarded = isCorrect ? q.marks : 0;

      let correctAnswerText = "Unavailable";
      if (numEval) {
        if (numEval.mode === "EXACT") {
          correctAnswerText = `${numEval.exact_val}`;
        } else if (numEval.mode === "RANGE") {
          correctAnswerText = `${numEval.min_val} to ${numEval.max_val} (inclusive)`;
        }
      }

      return {
        id: q.id,
        sequenceNumber: idx + 1,
        sourceQuestionNumber: q.sourceQuestionNumber,
        type: "NUMERICAL",
        text: q.text,
        textHtml: q.textHtml,
        marks: q.marks,
        marksAwarded,
        status,
        imageUrl: q.imageUrl,
        imageUrls: q.imageUrls,
        images: q.images,
        codeSnippet: q.codeSnippet,
        sectionId: q.sectionId,
        groupId: q.groupId,
        studentAnswerText: studentValStr,
        correctAnswerText,
        numericalEvaluation: numEval
          ? {
              mode: numEval.mode,
              exactVal: numEval.exact_val,
              minVal: numEval.min_val,
              maxVal: numEval.max_val,
            }
          : undefined,
      };
    }
  });

  const score = Number(res?.score || 0);
  const totalPaperMarks = exam.questions.reduce((sum, q) => sum + q.marks, 0);
  const maxMarks = Number(res?.max_marks || totalPaperMarks);
  const percentage = maxMarks > 0 ? Number(((score / maxMarks) * 100).toFixed(1)) : null;

  return {
    allowed: true,
    answersReleased: true,
    attemptId: attRow.id,
    assessmentTitle: event.title,
    assessmentType: typeObj?.name || (isTest ? "Test Assignment" : "Standard Exam"),
    assignmentType: isTest ? "TEST" : "PRODUCTION",
    isTest,
    isTester: role === "tester",
    subjectName: sub?.name || "Subject",
    subjectCode: sub?.code || "",
    attemptNumber: attRow.attempt_number || 1,
    completedAt: res?.evaluated_at || attRow.end_time || attRow.start_time,
    score,
    maxMarks,
    percentage,
    status: resultStatus,
    referenceMaterial: exam.referenceMaterial,
    sections: exam.sections,
    groups: exam.groups?.map((g) => ({
      id: g.id,
      title: g.title,
      titleHtml: g.titleHtml,
      passage: g.passage,
      passageHtml: g.passageHtml,
      imageUrl: g.imageUrl,
      imageUrls: g.imageUrls,
      codeSnippet: g.codeSnippet,
      referenceMaterial: g.referenceMaterial,
      questionIds: g.questionIds,
    })),
    questions: questionReviewItems,
    siblingSubjects,
  };
}
