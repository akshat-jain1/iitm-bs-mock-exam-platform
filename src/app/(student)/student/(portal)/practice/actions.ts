"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { isAllowedScalerEmail } from "@/lib/auth/config";
import { getServiceClient } from "@/lib/supabase/service";
import { loadAttemptReview } from "@/lib/results/attempt-review";
import { gradePractice, hideAnswerKeys } from "@/lib/results/practice";
import type { ExamResponses } from "@/lib/types/exam";
import type { StudentAttemptReviewResult } from "../results/actions";

async function context() {
  const user = await getCachedUser();
  if (!user?.email || !isAllowedScalerEmail(user.email)) throw new Error("Please sign in with your student account");
  return { user, db: getServiceClient() };
}

export async function startPracticeAction(sourceAttemptId: string) {
  const { user, db } = await context();
  const review = await loadAttemptReview(sourceAttemptId);
  if (!review.allowed || !review.questions?.length) throw new Error(review.reason || "Practice unavailable");
  const { data: existing, error: readError } = await db.from("student_practice_sessions").select("id").eq("student_id", user.id).eq("source_attempt_id", sourceAttemptId).eq("status", "In Progress").maybeSingle();
  if (readError) throw new Error("Unable to load practice session");
  if (existing) return existing.id as string;
  const { data, error } = await db.from("student_practice_sessions").insert({ student_id: user.id, source_attempt_id: sourceAttemptId }).select("id").single();
  if (error?.code === "23505") {
    const { data: active } = await db.from("student_practice_sessions").select("id").eq("student_id", user.id).eq("source_attempt_id", sourceAttemptId).eq("status", "In Progress").single();
    if (active) return active.id as string;
  }
  if (error || !data) throw new Error("Unable to start practice");
  return data.id as string;
}

export async function getPracticeSessionAction(id: string) {
  const { user, db } = await context();
  const { data, error } = await db.from("student_practice_sessions").select("*").eq("id", id).eq("student_id", user.id).single();
  if (error || !data) throw new Error("Practice session not found");
  const source = await loadAttemptReview(data.source_attempt_id);
  if (!source.allowed) throw new Error(source.reason || "Practice unavailable");
  const completed = data.status === "Completed";
  const graded = completed ? gradePractice(source.questions || [], data.responses) : [];
  const review: StudentAttemptReviewResult = {
    ...source, siblingSubjects: [],
    questions: completed ? graded : (source.questions || []).map(q => ({ ...q, status: "UNANSWERED", marksAwarded: undefined, studentAnswerText: undefined, options: q.options?.map(o => ({ ...o, isStudentSelected: false })) })),
    score: completed ? Number(data.score) : undefined,
    maxMarks: completed ? Number(data.max_marks) : source.maxMarks,
    completedAt: data.completed_at,
  };
  return { id: data.id as string, sourceAttemptId: data.source_attempt_id as string, completed, revision: data.revision as number,
    responses: data.responses as ExamResponses, markedIds: data.marked_question_ids as string[], review: hideAnswerKeys(review) };
}

export async function savePracticeAction(id: string, responses: ExamResponses, markedIds: string[], revision: number, submit = false) {
  const { user, db } = await context();
  if (!Number.isInteger(revision) || revision < 0 || !Array.isArray(markedIds)) throw new Error("Invalid practice data");
  const { data: session, error: readError } = await db.from("student_practice_sessions").select("source_attempt_id, status").eq("id", id).eq("student_id", user.id).single();
  if (readError || !session || session.status !== "In Progress") throw new Error("This practice session is no longer active. Reload to see its result.");
  const source = await loadAttemptReview(session.source_attempt_id);
  if (!source.allowed) throw new Error(source.reason || "Practice unavailable");
  const graded = gradePractice(source.questions || [], responses);
  if (markedIds.some(id => !source.questions?.some(q => q.id === id))) throw new Error("Invalid marked question");
  const score = graded.reduce((n, q) => n + (q.marksAwarded || 0), 0);
  const maxMarks = graded.reduce((n, q) => n + q.marks, 0);
  const now = new Date().toISOString();
  const { data, error } = await db.from("student_practice_sessions").update({ responses, marked_question_ids: [...new Set(markedIds)], revision: revision + 1, updated_at: now,
    ...(submit ? { status: "Completed", completed_at: now, score, max_marks: maxMarks } : {}) })
    .eq("id", id).eq("student_id", user.id).eq("status", "In Progress").eq("revision", revision).select("id").maybeSingle();
  if (error || !data) throw new Error("Practice could not be saved. Another tab may have changed it; reload before continuing.");
  return { revision: revision + 1 };
}

export async function revealPracticeAnswerAction(id: string, questionId: string) {
  const { user, db } = await context();
  const { data } = await db.from("student_practice_sessions").select("source_attempt_id, responses").eq("id", id).eq("student_id", user.id).eq("status", "Completed").single();
  if (!data) throw new Error("Finish practice before revealing answers");
  const source = await loadAttemptReview(data.source_attempt_id);
  if (!source.allowed) throw new Error(source.reason || "Review unavailable");
  const question = gradePractice(source.questions || [], data.responses).find(q => q.id === questionId);
  if (!question) throw new Error("Question unavailable");
  return question;
}

export async function getPracticeHistoryAction() {
  const { user } = await context();
  // Use the user's RLS context so demoted testers cannot see old TEST practice.
  const client = await createClient();
  const { data, error } = await client.from("student_practice_sessions").select("id, source_attempt_id, status, score, max_marks, started_at, completed_at").eq("student_id", user.id).order("started_at", { ascending: false });
  if (error) throw new Error("Unable to load practice history");
  return (data || []) as Array<{ id: string; source_attempt_id: string; status: string; score: number | null; max_marks: number | null; started_at: string; completed_at: string | null }>;
}
