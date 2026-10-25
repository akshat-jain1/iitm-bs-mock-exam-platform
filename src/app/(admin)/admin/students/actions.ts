"use server"

import { verifyAdmin } from "@/lib/auth/cached-auth"
import { revalidatePath } from "next/cache"

export async function updateUserRoleAction(
  targetUserId: string,
  newRole: "student" | "admin" | "tester"
) {
  // Enforce administrator authorization server-side
  const { supabase } = await verifyAdmin()

  // Execute secure RPC function with caller's authenticated session (RLS & role enforced in DB)
  const { error } = await supabase.rpc("set_user_role", {
    target_user_id: targetUserId,
    new_role: newRole,
  })

  if (error) {
    console.error("Failed to update user role:", error.message)
    throw new Error(error.message)
  }

  revalidatePath("/admin/students")
  return { success: true }
}
