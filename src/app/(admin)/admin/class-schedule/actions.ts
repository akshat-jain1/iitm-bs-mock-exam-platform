"use server";

import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { istToIso } from "@/lib/classes/datetime";
import type { ClassScheduleItem } from "@/lib/classes/actions";

export interface ScheduleFormData {
  subjectId: string;
  date: string;
  startTime: string;
  endTime: string;
  classroom: string;
}

export interface AdminSubjectItem {
  id: string;
  code: string;
  name: string;
}

/**
 * Fetches all class schedules for the administrator management view,
 * sorted chronologically by starts_at ASC.
 */
export async function getAdminClassSchedulesAction(): Promise<{
  data: ClassScheduleItem[];
  error: string | null;
}> {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("class_schedules")
      .select(`
        id,
        subject_id,
        classroom,
        starts_at,
        ends_at,
        created_at,
        updated_at,
        created_by,
        subjects (
          id,
          code,
          name
        )
      `)
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Error fetching admin class schedules:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data as unknown as ClassScheduleItem[]) || [],
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load class schedules.";
    return { data: [], error: message };
  }
}

/**
 * Fetches existing subjects to populate the subject dropdown in the admin schedule form.
 */
export async function getAdminSubjectsAction(): Promise<AdminSubjectItem[]> {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("subjects")
      .select("id, code, name")
      .order("name", { ascending: true });

    if (error || !data) {
      console.error("Error fetching subjects for class schedules:", error);
      return [];
    }

    return data as AdminSubjectItem[];
  } catch (err) {
    console.error("Unexpected error in getAdminSubjectsAction:", err);
    return [];
  }
}

/**
 * Validates the five business fields server-side according to specification.
 */
async function validateScheduleInput(
  supabase: Awaited<ReturnType<typeof verifyAdmin>>["supabase"],
  payload: ScheduleFormData
): Promise<{
  valid: boolean;
  error?: string;
  startsAt?: string;
  endsAt?: string;
  classroom?: string;
}> {
  const { subjectId, date, startTime, endTime, classroom: rawClassroom } = payload;

  // 1. Verify required presence
  if (!subjectId || !date || !startTime || !endTime || !rawClassroom) {
    return { valid: false, error: "All five fields are required." };
  }

  // 2. Validate classroom code (alphanumeric, trimmed, max 50 chars)
  const classroom = rawClassroom.trim();
  if (classroom.length === 0) {
    return { valid: false, error: "Classroom code cannot be empty." };
  }
  if (classroom.length > 50) {
    return { valid: false, error: "Classroom code cannot exceed 50 characters." };
  }
  if (!/^[a-zA-Z0-9\s\-._/]+$/.test(classroom)) {
    return {
      valid: false,
      error: "Classroom code must contain only letters, numbers, spaces, or hyphens (e.g. 1A, 2B, 101, LAB2).",
    };
  }

  // 3. Verify subject exists in the subjects table
  const { data: subject, error: subjErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .maybeSingle();

  if (subjErr || !subject) {
    return { valid: false, error: "The selected subject does not exist." };
  }

  // 4. Validate date and times in Asia/Kolkata
  let startsAt: string;
  let endsAt: string;
  try {
    startsAt = istToIso(date, startTime);
    endsAt = istToIso(date, endTime);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid date or time specification.";
    return { valid: false, error: msg };
  }

  // 5. Ensure ends_at is strictly later than starts_at
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (endMs <= startMs) {
    return {
      valid: false,
      error: "End time must be strictly later than start time.",
    };
  }

  return { valid: true, startsAt, endsAt, classroom };
}

/**
 * Creates a new scheduled class entry.
 */
export async function createClassScheduleAction(payload: ScheduleFormData): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  try {
    const { supabase, user } = await verifyAdmin();

    const validation = await validateScheduleInput(supabase, payload);
    if (!validation.valid || !validation.startsAt || !validation.endsAt || !validation.classroom) {
      return { success: false, error: validation.error || "Validation failed." };
    }

    const { data, error } = await supabase
      .from("class_schedules")
      .insert({
        subject_id: payload.subjectId,
        classroom: validation.classroom,
        starts_at: validation.startsAt,
        ends_at: validation.endsAt,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating class schedule:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/class-schedule");
    revalidatePath("/student");
    revalidatePath("/student/classes");

    return { success: true, id: data.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create class schedule.";
    return { success: false, error: message };
  }
}

/**
 * Updates an existing scheduled class entry.
 */
export async function updateClassScheduleAction(
  id: string,
  payload: ScheduleFormData
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase } = await verifyAdmin();

    if (!id) {
      return { success: false, error: "Class schedule ID is required." };
    }

    const validation = await validateScheduleInput(supabase, payload);
    if (!validation.valid || !validation.startsAt || !validation.endsAt || !validation.classroom) {
      return { success: false, error: validation.error || "Validation failed." };
    }

    const { error } = await supabase
      .from("class_schedules")
      .update({
        subject_id: payload.subjectId,
        classroom: validation.classroom,
        starts_at: validation.startsAt,
        ends_at: validation.endsAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating class schedule:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/class-schedule");
    revalidatePath("/student");
    revalidatePath("/student/classes");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update class schedule.";
    return { success: false, error: message };
  }
}

/**
 * Deletes a scheduled class entry after admin confirmation.
 */
export async function deleteClassScheduleAction(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase } = await verifyAdmin();

    if (!id) {
      return { success: false, error: "Class schedule ID is required." };
    }

    const { error } = await supabase.from("class_schedules").delete().eq("id", id);

    if (error) {
      console.error("Error deleting class schedule:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/class-schedule");
    revalidatePath("/student");
    revalidatePath("/student/classes");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete class schedule.";
    return { success: false, error: message };
  }
}
