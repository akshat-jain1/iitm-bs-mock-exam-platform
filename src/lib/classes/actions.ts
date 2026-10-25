"use server";

import { createClient } from "@/lib/supabase/server";

export interface ClassScheduleItem {
  id: string;
  subject_id: string;
  classroom: string;
  starts_at: string;
  ends_at: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  subjects?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

/**
 * Retrieves upcoming class schedules (where ends_at >= current time).
 * Sorted chronologically by starts_at ASC.
 *
 * Safe execution: If the table does not exist or a database error occurs,
 * returns an empty array with error info without crashing the calling page.
 */
export async function getUpcomingClassesAction(options?: {
  limit?: number;
}): Promise<{ data: ClassScheduleItem[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    let query = supabase
      .from("class_schedules")
      .select(`
        id,
        subject_id,
        classroom,
        starts_at,
        ends_at,
        subjects (
          id,
          code,
          name
        )
      `)
      .gte("ends_at", nowIso)
      .order("starts_at", { ascending: true });

    if (options?.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching upcoming classes:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data as unknown as ClassScheduleItem[]) || [],
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load upcoming classes.";
    console.error("Unexpected error in getUpcomingClassesAction:", err);
    return { data: [], error: message };
  }
}
