"use server";

import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { invalidatePaperStructureCache } from "@/lib/exam/paper-cache";

// ------------------------------------------------------------------------------
// ASSESSMENT EVENT ACTIONS
// ------------------------------------------------------------------------------

export async function createAssessmentEventAction(payload: {
  title: string;
  assessment_type_id: string;
  scheduled_start?: string | null;
  status?: string;
  assignment_type?: 'PRODUCTION' | 'TEST';
  test_access_mode?: 'TESTER_ONLY' | 'ALL_ENROLLED' | null;
  test_attempt_policy?: 'UNLIMITED' | 'LIMITED' | null;
  test_max_attempts?: number | null;
  test_duration_mins?: number | null;
}) {
  const { supabase } = await verifyAdmin();

  if (!payload.title.trim()) {
    return { success: false, error: "Assessment title is required." };
  }
  if (!payload.assessment_type_id) {
    return { success: false, error: "Assessment Type is required." };
  }

  const isTest = payload.assignment_type === "TEST";

  const insertData: Record<string, unknown> = {
    title: payload.title.trim(),
    assessment_type_id: payload.assessment_type_id,
    scheduled_start: payload.scheduled_start ? new Date(payload.scheduled_start).toISOString() : null,
    status: payload.status || "Draft",
    assignment_type: payload.assignment_type || "PRODUCTION",
  };

  if (isTest) {
    insertData.test_access_mode = payload.test_access_mode || "TESTER_ONLY";
    insertData.test_attempt_policy = payload.test_attempt_policy || "UNLIMITED";
    if (payload.test_attempt_policy === "LIMITED" && payload.test_max_attempts) {
      insertData.test_max_attempts = payload.test_max_attempts;
    }
    if (payload.test_duration_mins) {
      insertData.test_duration_mins = payload.test_duration_mins;
    }
  }

  const { data: event, error } = await supabase
    .from("assessment_events")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/exams");
  return { success: true, eventId: event.id };
}

export async function updateAssessmentEventAction(payload: {
  id: string;
  title?: string;
  scheduled_start?: string | null;
  status?: string;
  assignment_type?: 'PRODUCTION' | 'TEST';
  test_access_mode?: 'TESTER_ONLY' | 'ALL_ENROLLED' | null;
  test_attempt_policy?: 'UNLIMITED' | 'LIMITED' | null;
  test_max_attempts?: number | null;
  test_duration_mins?: number | null;
}) {
  const { supabase } = await verifyAdmin();

  // 1. Fetch current event to detect configuration changes
  const { data: currentEvent, error: fetchErr } = await supabase
    .from("assessment_events")
    .select("id, assignment_type, test_access_mode, test_attempt_policy, test_max_attempts, test_duration_mins")
    .eq("id", payload.id)
    .single();

  if (fetchErr || !currentEvent) {
    return { success: false, error: "Assessment event not found." };
  }

  // 2. Check if configuration or assignment type is changing
  const isChangingConfig =
    (payload.assignment_type !== undefined && payload.assignment_type !== currentEvent.assignment_type) ||
    (payload.test_access_mode !== undefined && payload.test_access_mode !== currentEvent.test_access_mode) ||
    (payload.test_attempt_policy !== undefined && payload.test_attempt_policy !== currentEvent.test_attempt_policy) ||
    (payload.test_max_attempts !== undefined && payload.test_max_attempts !== currentEvent.test_max_attempts) ||
    (payload.test_duration_mins !== undefined && payload.test_duration_mins !== currentEvent.test_duration_mins);

  if (isChangingConfig) {
    // Verify whether any student attempts exist for this event
    const { count: attemptCount, error: countErr } = await supabase
      .from("attempts")
      .select("id, assessment_subjects!inner(assessment_event_id)", { count: "exact", head: true })
      .eq("assessment_subjects.assessment_event_id", payload.id);

    if (countErr) {
      return { success: false, error: countErr.message };
    }

    if ((attemptCount ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot modify assignment type or test configuration: ${attemptCount} student attempt(s) already exist for this assessment. Configuration is permanently frozen.`,
      };
    }
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.title !== undefined) updateData.title = payload.title.trim();
  if (payload.scheduled_start !== undefined) {
    updateData.scheduled_start = payload.scheduled_start ? new Date(payload.scheduled_start).toISOString() : null;
  }
  if (payload.status !== undefined) updateData.status = payload.status;

  const targetAssignmentType = payload.assignment_type !== undefined ? payload.assignment_type : currentEvent.assignment_type;

  if (targetAssignmentType === "PRODUCTION") {
    updateData.assignment_type = "PRODUCTION";
    updateData.test_access_mode = null;
    updateData.test_attempt_policy = null;
    updateData.test_max_attempts = null;
    updateData.test_duration_mins = null;
  } else if (targetAssignmentType === "TEST") {
    const accessMode = payload.test_access_mode || currentEvent.test_access_mode || "TESTER_ONLY";
    const attemptPolicy = payload.test_attempt_policy || currentEvent.test_attempt_policy || "UNLIMITED";
    const durationMins = payload.test_duration_mins !== undefined && payload.test_duration_mins !== null
      ? payload.test_duration_mins
      : currentEvent.test_duration_mins !== null
      ? currentEvent.test_duration_mins
      : 60;
    const maxAttempts = attemptPolicy === "LIMITED"
      ? (payload.test_max_attempts !== undefined && payload.test_max_attempts !== null
          ? payload.test_max_attempts
          : currentEvent.test_max_attempts || 1)
      : null;

    if (!durationMins || durationMins <= 0) {
      return { success: false, error: "Test duration must be greater than 0 minutes." };
    }
    if (attemptPolicy === "LIMITED" && (!maxAttempts || maxAttempts <= 0)) {
      return { success: false, error: "Max attempts must be at least 1 when attempt policy is LIMITED." };
    }

    updateData.assignment_type = "TEST";
    updateData.test_access_mode = accessMode;
    updateData.test_attempt_policy = attemptPolicy;
    updateData.test_max_attempts = maxAttempts;
    updateData.test_duration_mins = durationMins;
  }

  const { error } = await supabase
    .from("assessment_events")
    .update(updateData)
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/exams/${payload.id}`);
  revalidatePath("/admin/exams");
  revalidatePath("/student");
  return { success: true };
}

export async function deleteAssessmentEventAction(id: string) {
  const { supabase } = await verifyAdmin();

  // Check if any attempts exist for this event
  const { data: subjects } = await supabase
    .from("assessment_subjects")
    .select("id")
    .eq("assessment_event_id", id);

  const subjectIds = (subjects || []).map((s) => s.id);
  if (subjectIds.length > 0) {
    const { count } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .in("assessment_subject_id", subjectIds);

    if (count && count > 0) {
      return {
        success: false,
        error: `Cannot delete assessment event: ${count} student attempt(s) already exist.`,
      };
    }
  }

  const { error } = await supabase
    .from("assessment_events")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/exams");
  return { success: true };
}

// ------------------------------------------------------------------------------
// SUBJECT & PAPER VERSION ASSIGNMENT ACTIONS
// ------------------------------------------------------------------------------

export async function addSubjectToEventAction(payload: {
  assessment_event_id: string;
  subject_id: string;
  paper_set_version_id: string;
}) {
  const { supabase } = await verifyAdmin();

  // 1. Fetch Event to verify assessment type
  const { data: event, error: eventError } = await supabase
    .from("assessment_events")
    .select("assessment_type_id")
    .eq("id", payload.assessment_event_id)
    .single();

  if (eventError || !event) {
    return { success: false, error: "Assessment event not found." };
  }

  // 2. Fetch Paper Set Version to verify compatibility
  const { data: paperVer, error: verError } = await supabase
    .from("paper_set_versions")
    .select("subject_id, assessment_type_id")
    .eq("id", payload.paper_set_version_id)
    .single();

  if (verError || !paperVer) {
    return { success: false, error: "Paper Set Version not found." };
  }

  if (paperVer.subject_id !== payload.subject_id) {
    return {
      success: false,
      error: "Compatibility Error: The selected paper version does not belong to the selected subject.",
    };
  }

  if (paperVer.assessment_type_id !== event.assessment_type_id) {
    return {
      success: false,
      error: "Compatibility Error: The selected paper version Assessment Type does not match the Event Assessment Type.",
    };
  }

  // 3. Insert into assessment_subjects
  const { data: asubj, error: insertError } = await supabase
    .from("assessment_subjects")
    .insert({
      assessment_event_id: payload.assessment_event_id,
      subject_id: payload.subject_id,
      paper_set_version_id: payload.paper_set_version_id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, error: "This subject is already included in this Assessment Event." };
    }
    return { success: false, error: insertError.message };
  }

  // Invalidate any existing cached structure for this version and tags
  invalidatePaperStructureCache(payload.paper_set_version_id);

  revalidatePath(`/admin/exams/${payload.assessment_event_id}`);
  revalidatePath("/admin/exams");
  revalidatePath("/student");
  return { success: true, assessmentSubjectId: asubj.id };
}

export async function removeSubjectFromEventAction(payload: {
  assessment_subject_id: string;
  assessment_event_id: string;
}) {
  const { supabase } = await verifyAdmin();

  // Check if attempts exist for this assessment subject
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_subject_id", payload.assessment_subject_id);

  if (count && count > 0) {
    return {
      success: false,
      error: `Cannot remove subject: ${count} student attempt(s) exist for this subject. Subject identity is frozen.`,
    };
  }

  const { error } = await supabase
    .from("assessment_subjects")
    .delete()
    .eq("id", payload.assessment_subject_id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/exams/${payload.assessment_event_id}`);
  revalidatePath("/admin/exams");
  return { success: true };
}

export async function updateAssessmentSubjectPaperAction(payload: {
  assessment_subject_id: string;
  assessment_event_id: string;
  paper_set_version_id: string;
}) {
  const { supabase } = await verifyAdmin();

  // Check if attempts exist
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_subject_id", payload.assessment_subject_id);

  if (count && count > 0) {
    return {
      success: false,
      error: `Cannot modify paper version: ${count} student attempt(s) already exist. Paper assignment is frozen.`,
    };
  }

  // Update paper_set_version_id
  const { error } = await supabase
    .from("assessment_subjects")
    .update({ paper_set_version_id: payload.paper_set_version_id })
    .eq("id", payload.assessment_subject_id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Invalidate any existing cached structure for this version and tags
  invalidatePaperStructureCache(payload.paper_set_version_id);

  revalidatePath(`/admin/exams/${payload.assessment_event_id}`);
  revalidatePath("/admin/exams");
  return { success: true };
}
