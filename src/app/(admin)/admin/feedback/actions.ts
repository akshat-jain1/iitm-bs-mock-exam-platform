"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { revalidatePath } from "next/cache";
import {
  AdminFeedbackFilters,
  AdminFeedbackStats,
  StudentFeedbackItem,
  FeedbackStatusHistoryItem,
  FeedbackInternalNoteItem,
  FeedbackStatusUpdateInput,
} from "@/lib/feedback/types";
import { validateStatusUpdate, validateInternalNote } from "@/lib/feedback/validation";

export interface AdminFeedbackListResult {
  items: StudentFeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: AdminFeedbackStats;
}

export interface AdminFeedbackDetailResult {
  feedback: StudentFeedbackItem | null;
  history: FeedbackStatusHistoryItem[];
  internalNotes: FeedbackInternalNoteItem[];
}

/**
 * Retrieves paginated, filtered feedback items for administrators.
 */
export async function getAdminFeedbackListAction(
  filters: AdminFeedbackFilters = {}
): Promise<AdminFeedbackListResult> {
  await verifyAdmin();
  const queryClient = getServiceClientOrNull() || (await createClient());

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize || 20));
  const sortBy = filters.sortBy || "created_at";
  const sortOrder = filters.sortOrder === "asc";

  // 1. Efficient counts for workflow badges
  const [
    { count: totalCount },
    { count: newCount },
    { count: underReviewCount },
    { count: inProgressCount },
    { count: closedCount },
  ] = await Promise.all([
    queryClient.from("student_feedback").select("id", { count: "exact", head: true }),
    queryClient.from("student_feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    queryClient.from("student_feedback").select("id", { count: "exact", head: true }).eq("status", "under_review"),
    queryClient.from("student_feedback").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    queryClient.from("student_feedback").select("id", { count: "exact", head: true }).eq("status", "closed"),
  ]);

  const stats: AdminFeedbackStats = {
    totalCount: totalCount || 0,
    newCount: newCount || 0,
    underReviewCount: underReviewCount || 0,
    inProgressCount: inProgressCount || 0,
    closedCount: closedCount || 0,
  };

  // 2. Main filtered query
  let query = queryClient.from("student_feedback").select(
    `
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
      users:user_id ( id, name, email ),
      subjects:subject_id ( id, code, name ),
      assessment_events:assessment_event_id ( id, title )
    `,
    { count: "exact" }
  );

  // Status filter
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  // Category filter
  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  // Search filter (parameterized title or description match)
  if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
    const cleanedSearch = filters.searchQuery.trim().replace(/[%_]/g, "");
    if (cleanedSearch.length > 0) {
      query = query.or(`title.ilike.%${cleanedSearch}%,description.ilike.%${cleanedSearch}%`);
    }
  }

  // Sort and pagination
  query = query
    .order(sortBy, { ascending: sortOrder })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;

  if (error || !data) {
    console.error("[getAdminFeedbackListAction] Query error:", error);
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      stats,
    };
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
    users: { id: string; name: string; email: string } | null;
    subjects: { id: string; code: string; name: string } | null;
    assessment_events: { id: string; title: string } | null;
  }

  const items: StudentFeedbackItem[] = (data as unknown as RawRow[]).map((row) => ({
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
    user: row.users || null,
    subject: row.subjects || null,
    assessment: row.assessment_events || null,
  }));

  return {
    items,
    total: count || 0,
    page,
    pageSize,
    stats,
  };
}

/**
 * Retrieves full feedback item details, audit history, and internal notes for staff.
 */
export async function getAdminFeedbackDetailAction(
  feedbackId: string
): Promise<AdminFeedbackDetailResult> {
  await verifyAdmin();
  const queryClient = getServiceClientOrNull() || (await createClient());

  const [itemRes, historyRes, notesRes] = await Promise.all([
    queryClient
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
        users:user_id ( id, name, email ),
        subjects:subject_id ( id, code, name ),
        assessment_events:assessment_event_id ( id, title )
      `)
      .eq("id", feedbackId)
      .single(),
    queryClient
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
        users:changed_by ( id, name, email )
      `)
      .eq("feedback_id", feedbackId)
      .order("created_at", { ascending: true }),
    queryClient
      .from("student_feedback_internal_notes")
      .select(`
        id,
        feedback_id,
        author_id,
        note,
        created_at,
        updated_at,
        users:author_id ( id, name, email )
      `)
      .eq("feedback_id", feedbackId)
      .order("created_at", { ascending: false }),
  ]);

  if (itemRes.error || !itemRes.data) {
    return { feedback: null, history: [], internalNotes: [] };
  }

  interface RawItemRow {
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
    users: { id: string; name: string; email: string } | null;
    subjects: { id: string; code: string; name: string } | null;
    assessment_events: { id: string; title: string } | null;
  }

  const row = itemRes.data as unknown as RawItemRow;
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
    user: row.users || null,
    subject: row.subjects || null,
    assessment: row.assessment_events || null,
  };

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
    users: { id: string; name: string; email: string } | null;
  }

  const history: FeedbackStatusHistoryItem[] = ((historyRes.data || []) as unknown as RawHistoryRow[]).map(
    (h) => ({
      id: h.id,
      feedback_id: h.feedback_id,
      changed_by: h.changed_by,
      old_status: (h.old_status as FeedbackStatusHistoryItem["old_status"]) || null,
      new_status: h.new_status as FeedbackStatusHistoryItem["new_status"],
      old_outcome: (h.old_outcome as FeedbackStatusHistoryItem["old_outcome"]) || null,
      new_outcome: (h.new_outcome as FeedbackStatusHistoryItem["new_outcome"]) || null,
      message: h.message,
      created_at: h.created_at,
      actor: h.users || null,
    })
  );

  interface RawNoteRow {
    id: string;
    feedback_id: string;
    author_id: string;
    note: string;
    created_at: string;
    updated_at: string;
    users: { id: string; name: string; email: string } | null;
  }

  const internalNotes: FeedbackInternalNoteItem[] = ((notesRes.data || []) as unknown as RawNoteRow[]).map(
    (n) => ({
      id: n.id,
      feedback_id: n.feedback_id,
      author_id: n.author_id,
      note: n.note,
      created_at: n.created_at,
      updated_at: n.updated_at,
      author: n.users || null,
    })
  );

  return { feedback, history, internalNotes };
}

/**
 * Updates status, resolution outcome, and records history for a feedback item.
 */
export async function updateAdminFeedbackStatusAction(
  rawInput: FeedbackStatusUpdateInput
): Promise<{ success: boolean; error?: string }> {
  const { user } = await verifyAdmin();

  const validation = validateStatusUpdate(rawInput);
  if (!validation.valid) {
    const errorMsg = Object.values(validation.errors).join("; ");
    return { success: false, error: errorMsg };
  }

  const data = validation.data;
  const queryClient = getServiceClientOrNull() || (await createClient());

  // 1. Attempt to invoke RPC update_feedback_status_v1
  const rpcResult = await queryClient.rpc("update_feedback_status_v1", {
    p_feedback_id: data.feedback_id,
    p_new_status: data.new_status,
    p_outcome: data.outcome || null,
    p_resolution_note: data.resolution_note || null,
    p_student_message: data.student_message || null,
    p_internal_note: data.internal_note || null,
    p_actor_id: user.id,
  });

  if (!rpcResult.error) {
    revalidatePath("/admin/feedback");
    revalidatePath("/student/feedback");
    return { success: true };
  }

  const rpcMsg = rpcResult.error.message || "";
  const isExpectedValidationOrAuthError =
    rpcMsg.includes("requires a valid outcome") ||
    rpcMsg.includes("cannot have a resolution outcome") ||
    rpcMsg.includes("not found") ||
    rpcMsg.includes("Invalid status") ||
    rpcMsg.includes("Administrator privileges required");

  if (isExpectedValidationOrAuthError) {
    return { success: false, error: rpcMsg };
  }

  // Production security & reliability: fail closed.
  // Never silently fall back to direct multi-statement updates with weaker
  // concurrency locks, un-atomic status history, or bypassed procedure logic.
  console.error(
    "[updateAdminFeedbackStatusAction] update_feedback_status_v1 execution error:",
    rpcResult.error
  );
  return {
    success: false,
    error: "Failed to update feedback status. Please try again.",
  };
}

/**
 * Adds a private staff internal note.
 */
export async function addAdminInternalNoteAction(
  feedbackId: string,
  noteText: string
): Promise<{ success: boolean; error?: string; noteId?: string }> {
  const { user } = await verifyAdmin();

  const validation = validateInternalNote(noteText);
  if (!validation.valid) {
    return { success: false, error: validation.errors.note || "Invalid note text." };
  }

  const queryClient = getServiceClientOrNull() || (await createClient());

  const { data, error } = await queryClient
    .from("student_feedback_internal_notes")
    .insert({
      feedback_id: feedbackId,
      author_id: user.id,
      note: validation.data,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: `Failed to save internal note: ${error?.message || "Unknown error"}` };
  }

  revalidatePath("/admin/feedback");
  return { success: true, noteId: data.id };
}
