"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { isAllowedScalerEmail } from "@/lib/auth/config";
import { revalidatePath } from "next/cache";
import {
  FeedbackSubmissionInput,
  StudentFeedbackItem,
  FeedbackStatusHistoryItem,
} from "@/lib/feedback/types";
import { validateFeedbackSubmission } from "@/lib/feedback/validation";
import { checkInMemoryRateLimit, recordSubmission } from "@/lib/feedback/rate-limit";

export interface SubmitFeedbackResult {
  success: boolean;
  feedbackId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ContextOptions {
  subjects: Array<{ id: string; code: string; name: string }>;
  assessments: Array<{ id: string; title: string }>;
}

/**
 * Submits a new feedback item from the authenticated student.
 * Submitter ID is strictly derived from the authenticated session.
 */
export async function submitFeedbackAction(
  rawInput: FeedbackSubmissionInput
): Promise<SubmitFeedbackResult> {
  const user = await getCachedUser();
  if (!user) {
    return { success: false, error: "Authentication required. Please sign in." };
  }

  // Domain guard
  if (!isAllowedScalerEmail(user.email)) {
    return { success: false, error: "Access restricted: Official Scaler student account required." };
  }

  const role = await getCachedUserRole(user);
  if (!["student", "tester", "admin"].includes(role)) {
    return { success: false, error: "Unauthorized role for submitting feedback." };
  }

  // Server-side validation
  const validation = validateFeedbackSubmission(rawInput);
  if (!validation.valid) {
    return {
      success: false,
      error: "Please correct the errors in the form.",
      fieldErrors: validation.errors,
    };
  }

  const data = validation.data;

  // In-memory rate limiting & duplicate prevention
  const rateLimitCheck = checkInMemoryRateLimit(user.id, data.title);
  if (!rateLimitCheck.allowed) {
    return { success: false, error: rateLimitCheck.reason || "Submission rate limit exceeded." };
  }

  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;

  // 1. Authoritative atomic database RPC with advisory transaction lock
  const rpcResult = await queryClient.rpc("submit_student_feedback_v1", {
    p_category: data.category,
    p_title: data.title,
    p_description: data.description,
    p_subject_id: data.subject_id || null,
    p_assessment_event_id: data.assessment_event_id || null,
    p_question_reference: data.question_reference || null,
    p_page_url: data.page_url || null,
    p_user_id: user.id,
  });

  if (!rpcResult.error) {
    const feedbackId = (rpcResult.data as { feedback_id?: string })?.feedback_id;
    recordSubmission(user.id, data.title);
    revalidatePath("/student/feedback");
    return { success: true, feedbackId };
  }

  // Handle expected rate limit or validation exceptions raised by the database procedure
  const rpcErrorMsg = rpcResult.error.message || "";
  const isExpectedRateLimitOrValidationError =
    rpcErrorMsg.includes("already received just now") ||
    rpcErrorMsg.includes("too quickly") ||
    rpcErrorMsg.includes("hourly feedback submission limit") ||
    rpcErrorMsg.includes("daily feedback submission limit") ||
    rpcErrorMsg.includes("Title must be between") ||
    rpcErrorMsg.includes("Description must be between") ||
    rpcErrorMsg.includes("Invalid feedback category");

  if (isExpectedRateLimitOrValidationError) {
    return { success: false, error: rpcErrorMsg };
  }

  // Production security & reliability: fail closed.
  // Never silently fall back to direct inserts with weaker rate-limiting,
  // missing advisory locks, non-atomic status history, or duplicate retries.
  console.error(
    "[submitFeedbackAction] submit_student_feedback_v1 execution error:",
    rpcResult.error
  );
  return {
    success: false,
    error: "Feedback submission is temporarily unavailable. Please try again in a moment.",
  };
}

/**
 * Retrieves all submissions created by the authenticated student.
 * Never accesses or returns other students' items or private staff notes.
 */
export async function getStudentFeedbackListAction(): Promise<StudentFeedbackItem[]> {
  const user = await getCachedUser();
  if (!user) {
    return [];
  }

  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;

  const { data, error } = await queryClient
    .from("student_feedback")
    .select(`
      id,
      user_id,
      category,
      title,
      description,
      status,
      resolution_outcome,
      resolution_note,
      subject_id,
      assessment_event_id,
      question_reference,
      page_url,
      metadata,
      created_at,
      updated_at,
      subjects:subject_id ( id, code, name ),
      assessment_events:assessment_event_id ( id, title )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[getStudentFeedbackListAction] Fetch error:", error);
    return [];
  }

  interface RawRow {
    id: string;
    user_id: string;
    category: string;
    title: string;
    description: string;
    status: string;
    resolution_outcome: string | null;
    resolution_note: string | null;
    subject_id: string | null;
    assessment_event_id: string | null;
    question_reference: string | null;
    page_url: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    subjects: { id: string; code: string; name: string } | null;
    assessment_events: { id: string; title: string } | null;
  }

  return (data as unknown as RawRow[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    category: row.category as StudentFeedbackItem["category"],
    title: row.title,
    description: row.description,
    status: row.status as StudentFeedbackItem["status"],
    resolution_outcome: row.resolution_outcome as StudentFeedbackItem["resolution_outcome"],
    resolution_note: row.resolution_note,
    subject_id: row.subject_id,
    assessment_event_id: row.assessment_event_id,
    question_reference: row.question_reference,
    page_url: row.page_url,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: row.subjects || null,
    assessment: row.assessment_events || null,
  }));
}

/**
 * Retrieves single feedback item and its student-visible status history.
 * Explicitly excludes private staff notes.
 */
export async function getStudentFeedbackDetailAction(feedbackId: string): Promise<{
  feedback: StudentFeedbackItem | null;
  history: FeedbackStatusHistoryItem[];
}> {
  const user = await getCachedUser();
  if (!user || !feedbackId) {
    return { feedback: null, history: [] };
  }

  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;

  // Verify ownership
  const { data: itemData, error: itemErr } = await queryClient
    .from("student_feedback")
    .select(`
      id,
      user_id,
      category,
      title,
      description,
      status,
      resolution_outcome,
      resolution_note,
      subject_id,
      assessment_event_id,
      question_reference,
      page_url,
      metadata,
      created_at,
      updated_at,
      subjects:subject_id ( id, code, name ),
      assessment_events:assessment_event_id ( id, title )
    `)
    .eq("id", feedbackId)
    .eq("user_id", user.id)
    .single();

  if (itemErr || !itemData) {
    return { feedback: null, history: [] };
  }

  // Fetch student-visible status history
  const { data: historyData } = await queryClient
    .from("student_feedback_status_history")
    .select(`
      id,
      feedback_id,
      changed_by,
      old_status,
      new_status,
      old_outcome,
      new_outcome,
      message,
      created_at,
      actor:changed_by ( id, name, email )
    `)
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true });

  interface RawHistoryRow {
    id: string;
    feedback_id: string;
    changed_by: string;
    old_status: string | null;
    new_status: string;
    old_outcome: string | null;
    new_outcome: string | null;
    message: string | null;
    created_at: string;
    actor: { id: string; name: string; email: string } | null;
  }

  const history: FeedbackStatusHistoryItem[] = (historyData as unknown as RawHistoryRow[] || []).map((h) => ({
    id: h.id,
    feedback_id: h.feedback_id,
    changed_by: h.changed_by,
    old_status: (h.old_status as FeedbackStatusHistoryItem["old_status"]) || null,
    new_status: h.new_status as FeedbackStatusHistoryItem["new_status"],
    old_outcome: (h.old_outcome as FeedbackStatusHistoryItem["old_outcome"]) || null,
    new_outcome: (h.new_outcome as FeedbackStatusHistoryItem["new_outcome"]) || null,
    message: h.message,
    created_at: h.created_at,
    actor: h.actor || null,
  }));

  const row = itemData as unknown as {
    id: string;
    user_id: string;
    category: string;
    title: string;
    description: string;
    status: string;
    resolution_outcome: string | null;
    resolution_note: string | null;
    subject_id: string | null;
    assessment_event_id: string | null;
    question_reference: string | null;
    page_url: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    subjects: { id: string; code: string; name: string } | null;
    assessment_events: { id: string; title: string } | null;
  };

  const feedback: StudentFeedbackItem = {
    id: row.id,
    user_id: row.user_id,
    category: row.category as StudentFeedbackItem["category"],
    title: row.title,
    description: row.description,
    status: row.status as StudentFeedbackItem["status"],
    resolution_outcome: row.resolution_outcome as StudentFeedbackItem["resolution_outcome"],
    resolution_note: row.resolution_note,
    subject_id: row.subject_id,
    assessment_event_id: row.assessment_event_id,
    question_reference: row.question_reference,
    page_url: row.page_url,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject: row.subjects || null,
    assessment: row.assessment_events || null,
  };

  return { feedback, history };
}

/**
 * Retrieves subjects and assessment options for contextual dropdowns.
 */
export async function getFeedbackContextOptionsAction(): Promise<ContextOptions> {
  const supabase = await createClient();
  const queryClient = getServiceClientOrNull() || supabase;

  const [subjectsRes, assessmentsRes] = await Promise.all([
    queryClient.from("subjects").select("id, code, name").order("code", { ascending: true }),
    queryClient
      .from("assessment_events")
      .select("id, title")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    subjects: subjectsRes.data || [],
    assessments: assessmentsRes.data || [],
  };
}
