import React from "react";
import { redirect } from 'next/navigation'
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();
  
  if (!user) {
    redirect('/login');
  }

  const role = await getCachedUserRole(user);

  if (role !== 'admin') {
    redirect('/student'); // Redirect unauthorized users to their portal
  }

  const userName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
    null;

  return (
    <AdminLayoutClient userName={userName} userEmail={user.email}>
      {children}
    </AdminLayoutClient>
  );
}
