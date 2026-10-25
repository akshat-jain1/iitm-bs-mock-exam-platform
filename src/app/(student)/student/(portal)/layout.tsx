import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { StudentHeader } from "@/components/student/StudentHeader";

export default async function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();
  const isTester = !!user && await getCachedUserRole(user, { skipJwtClaim: true }) === "tester";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans">
      <StudentHeader userEmail={user?.email} isTester={isTester} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
