import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  // 1. Fetch user record from public.users
  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, created_at")
    .eq("id", user.id)
    .single();

  if (!profile || !["student", "tester"].includes(profile.role)) {
    redirect("/login");
  }

  // 2. Fetch all available platform subjects
  const { data: allSubjects } = await supabase
    .from("subjects")
    .select("id, code, name")
    .order("code", { ascending: true });

  // 3. Fetch active enrollments for current student
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("subject_id")
    .eq("student_id", user.id)
    .eq("is_active", true);

  const initialSelectedSubjectIds = (enrollments || []).map((e) => e.subject_id);

  // 4. Check if student currently has an active Live exam attempt
  const { data: liveAttempts } = await supabase
    .from("attempts")
    .select("id")
    .eq("student_id", user.id)
    .eq("status", "Live")
    .limit(1);

  const hasActiveLiveExam = (liveAttempts && liveAttempts.length > 0) || false;

  // 5. Count completed attempts (official production exams only)
  const { count: attemptsCount } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.id)
    .eq("is_test", false)
    .eq("status", "Completed");

  // 6. Extract Google avatar if present
  const avatarUrl = (user.user_metadata?.avatar_url as string) || (user.user_metadata?.picture as string) || null;

  return (
    <ProfileClient
      initialName={profile.name || user.user_metadata?.full_name || "Student"}
      email={profile.email || user.email || ""}
      avatarUrl={avatarUrl}
      allSubjects={allSubjects || []}
      initialSelectedSubjectIds={initialSelectedSubjectIds}
      hasActiveLiveExam={hasActiveLiveExam}
      createdAt={profile.created_at}
      completedAttemptsCount={attemptsCount || 0}
    />
  );
}

