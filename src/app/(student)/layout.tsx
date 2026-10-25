import React from "react";
import { redirect } from 'next/navigation'
import { isAllowedScalerEmail } from '@/lib/auth/config'
import { getCachedUser, getCachedUserRole } from '@/lib/auth/cached-auth'

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();
  
  if (!user) {
    redirect('/login');
  }

  // Server-side enforcement of Scaler student domain
  if (!isAllowedScalerEmail(user.email)) {
    redirect('/login?error=scaler_domain_required');
  }

  const role = await getCachedUserRole(user);

  if (role === 'admin') {
    redirect('/admin'); // Redirect admin users to their portal
  }

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {children}
    </div>
  );
}
