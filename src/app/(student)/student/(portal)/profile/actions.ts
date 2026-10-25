"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export async function updateStudentDisplayNameAction(newName: string) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (authError || !claims?.sub) {
    return { success: false, error: "Unauthorized: Please sign in to update your profile." };
  }

  const user = {
    id: claims.sub as string,
    email: claims.email as string | undefined,
    user_metadata: (claims.user_metadata || {}) as Record<string, unknown>,
    user_role: claims.user_role as string | undefined,
  };

  // 1. Verify user role (fast-path via JWT claim, fallback to DB)
  let userRole = user.user_role;
  if (!userRole) {
    const { data: userProfile, error: profileErr } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      return { success: false, error: "Access denied: Only students can update student profiles." };
    }
    userRole = userProfile?.role;
  }

  if (userRole !== "student") {
    return { success: false, error: "Access denied: Only students can update student profiles." };
  }

  // 2. Validate display name
  const trimmedName = newName.trim();
  if (!trimmedName || trimmedName.length < 2) {
    return { success: false, error: "Display name must be at least 2 characters long." };
  }

  if (trimmedName.length > 100) {
    return { success: false, error: "Display name cannot exceed 100 characters." };
  }

  // 3. Update ONLY the name field in public.users (strictly never touching email, role, or credentials)
  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) {
    return { success: false, error: "Server configuration error: missing service key." };
  }

  const { error: updateError } = await serviceClient
    .from("users")
    .update({ 
      name: trimmedName,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Error updating profile display name:", updateError);
    return { success: false, error: "Failed to update profile. Please try again." };
  }

  // Also update auth.users raw_user_meta_data.full_name for consistency if applicable
  try {
    await serviceClient.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, full_name: trimmedName }
    });
  } catch (metaErr) {
    console.warn("Could not sync user_metadata full_name:", metaErr);
  }

  revalidatePath("/student/profile");
  revalidatePath("/student");

  return { success: true, name: trimmedName };
}

export async function updateStudentSubjectsAction(selectedSubjectIds: string[]) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (authError || !claims?.sub) {
    return { success: false, error: "Unauthorized: Please sign in to update your subjects." };
  }

  const user = {
    id: claims.sub as string,
    email: claims.email as string | undefined,
    user_role: claims.user_role as string | undefined,
  };

  // 1. Verify user role (fast-path via JWT claim, fallback to DB)
  let userRole = user.user_role;
  if (!userRole) {
    const { data: userProfile, error: profileErr } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      return { success: false, error: "Access denied: Only students can select subjects." };
    }
    userRole = userProfile?.role;
  }

  if (userRole !== "student") {
    return { success: false, error: "Access denied: Only students can select subjects." };
  }

  // 2. Validate maximum 4 subjects rule
  if (!Array.isArray(selectedSubjectIds)) {
    return { success: false, error: "Invalid subjects format." };
  }

  const uniqueSubjectIds = Array.from(new Set(selectedSubjectIds));

  if (uniqueSubjectIds.length > 4) {
    return { 
      success: false, 
      error: "Maximum 4 subjects allowed. Please deselect a subject before selecting another." 
    };
  }

  // 3. Verify all selected subject IDs exist in public.subjects
  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) {
    return { success: false, error: "Server configuration error: missing service key." };
  }

  const { data: allSubjects, error: subError } = await serviceClient
    .from("subjects")
    .select("id, code, name");

  if (subError || !allSubjects) {
    return { success: false, error: "Failed to fetch platform subjects." };
  }

  const validSubjectIdSet = new Set(allSubjects.map((s) => s.id));
  for (const sid of uniqueSubjectIds) {
    if (!validSubjectIdSet.has(sid)) {
      return { success: false, error: `Invalid subject ID: ${sid}` };
    }
  }

  // 4. Update student_enrollments:
  // Set is_active = true for selected, is_active = false for unselected.
  // We do deactivations first, then activations to never exceed active_count >= 4 trigger constraint.
  const unselectedSubjectIds = allSubjects
    .map((s) => s.id)
    .filter((id) => !uniqueSubjectIds.includes(id));

  // Deactivate unselected
  if (unselectedSubjectIds.length > 0) {
    const { error: deactErr } = await serviceClient
      .from("student_enrollments")
      .update({ is_active: false })
      .eq("student_id", user.id)
      .in("subject_id", unselectedSubjectIds);

    if (deactErr) {
      console.error("Error deactivating unselected subjects:", deactErr);
    }
  }

  // Activate / Upsert selected subjects
  for (const sid of uniqueSubjectIds) {
    const { error: upsertErr } = await serviceClient
      .from("student_enrollments")
      .upsert(
        {
          student_id: user.id,
          subject_id: sid,
          is_active: true,
        },
        { onConflict: "student_id, subject_id" }
      );

    if (upsertErr) {
      console.error("Error activating selected subject:", upsertErr);
      return { success: false, error: `Failed to update subject selection: ${upsertErr.message}` };
    }
  }

  revalidatePath("/student/profile");
  revalidatePath("/student");
  revalidatePath("/student/exams");

  return { success: true, selectedSubjectIds: uniqueSubjectIds };
}

