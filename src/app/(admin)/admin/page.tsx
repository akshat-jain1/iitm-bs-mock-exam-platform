import React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Badge } from "@/components/ui/Badge";

export default async function AdminDashboard() {
  const supabase = await createClient();

  // 1. Fetch Assessment Events, Students count, and Paper Templates count concurrently
  const [eventsRes, studentRes, paperRes] = await Promise.all([
    supabase
      .from("assessment_events")
      .select(`
        id,
        title,
        status,
        scheduled_start,
        assessment_types ( name )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "student"),
    supabase
      .from("paper_set_templates")
      .select("id", { count: "exact", head: true }),
  ]);

  const events = eventsRes.data;
  const studentCount = studentRes.count;
  const paperCount = paperRes.count;

  const totalExams = (events || []).length;
  const liveExams = (events || []).filter((e) => e.status === "Live").length;
  const scheduledExams = (events || []).filter((e) => e.status === "Scheduled").length;
  const recentExams = (events || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Platform overview and active assessment event metrics.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/question-bank">
            <button className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs">
              Paper Library ({paperCount || 0})
            </button>
          </Link>
          <Link href="/admin/exams">
            <button className="bg-blue-600 text-white px-3.5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-2xs">
              + Create Exam Event
            </button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Exams" value={totalExams} description="Configured assessment events" />
        <StatCard title="Live Exams" value={liveExams} description="Currently active for students" />
        <StatCard title="Scheduled" value={scheduledExams} description="Upcoming assessment windows" />
        <StatCard title="Total Students" value={studentCount || 0} description="Active enrolled student accounts" />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Recent Assessment Events</h2>
          <Link href="/admin/exams" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200">
            View All ({totalExams}) →
          </Link>
        </div>

        <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg">
          <div className="overflow-x-auto w-full">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[200px]">Exam Title</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Scheduled Start</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {recentExams.map((exam) => {
                  const aType = exam.assessment_types as unknown as { name: string } | Array<{ name: string }> | null;
                  const typeName = Array.isArray(aType) ? aType[0]?.name : aType?.name;
                  return (
                    <tr key={exam.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-50 break-words">{exam.title}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[180px]" title={exam.id}>ID: {exam.id}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge variant="secondary" className="font-mono text-xs">{typeName}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <StatusBadge status={exam.status} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {exam.scheduled_start ? new Date(exam.scheduled_start).toLocaleString() : "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium shrink-0">
                        <Link href={`/admin/exams/${exam.id}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 font-semibold px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors">
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {recentExams.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No assessment events scheduled yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
