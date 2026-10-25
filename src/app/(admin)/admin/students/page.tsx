import React from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { Badge } from "@/components/ui/Badge";
import { RoleToggleButton } from "./RoleToggleButton";

export default async function StudentsPage() {
  const user = await getCachedUser();
  const supabase = await createClient();

  // Fetch All Registered Users and Active Enrollments concurrently
  const [usersRes, enrollmentsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role")
      .order("role", { ascending: true }) // Admins first
      .order("name", { ascending: true }),
    supabase
      .from("student_enrollments")
      .select(`
        student_id,
        is_active,
        subjects!inner ( id, name, code )
      `),
  ]);

  const allUsers = usersRes.data;
  const enrollments = enrollmentsRes.data;

  const enrollmentMap: Record<string, Array<{ code: string; name: string }>> = {};
  (enrollments || []).forEach((e) => {
    if (e.is_active) {
      if (!enrollmentMap[e.student_id]) enrollmentMap[e.student_id] = [];
      const s = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      enrollmentMap[e.student_id].push({ code: s.code, name: s.name });
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">User & Role Management</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Registered platform accounts, roles (Student vs Administrator), and active subject enrollments.
        </p>
      </div>

      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-xl">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Name & Email
              </th>
              <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Current Role
              </th>
              <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Enrollments / Access
              </th>
              <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Role Management
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {(allUsers || []).map((u) => {
              const activeList = enrollmentMap[u.id] || [];
              const isCurrentUser = u.id === user?.id;

              return (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{u.name}</span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{u.email}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge
                      variant={u.role === "admin" ? "default" : u.role === "tester" ? "outline" : "secondary"}
                      className={`font-mono text-xs uppercase ${
                        u.role === "admin"
                          ? "bg-purple-600 text-white hover:bg-purple-700"
                          : u.role === "tester"
                          ? "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                          : ""
                      }`}
                    >
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {u.role === "admin" ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">
                        Full administrative & authoring access
                      </span>
                    ) : u.role === "tester" ? (
                      <div className="space-y-1">
                        <span className="inline-block text-[11px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded">
                          Tester Access (all subjects in TESTER_ONLY mock exams)
                        </span>
                        {activeList.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {activeList.map((subj) => (
                              <Badge key={subj.code} variant="outline" className="font-mono text-[10px]">
                                {subj.code}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic">No course enrollments required for TESTER_ONLY</div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {activeList.map((subj) => (
                          <Badge key={subj.code} variant="outline" className="font-mono text-xs">
                            {subj.code}
                          </Badge>
                        ))}
                        {activeList.length === 0 && (
                          <span className="text-xs text-slate-400 italic">No active enrollments</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <RoleToggleButton
                      userId={u.id}
                      currentRole={u.role as "student" | "admin" | "tester"}
                      isCurrentUser={isCurrentUser}
                    />
                  </td>
                </tr>
              );
            })}

            {(allUsers || []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No registered accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
