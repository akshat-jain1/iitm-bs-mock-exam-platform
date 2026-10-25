import React from "react";
import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { getUpcomingClassesAction, type ClassScheduleItem } from "@/lib/classes/actions";
import {
  formatISTTimeRange,
  getISTDateKey,
  formatISTGroupHeading,
} from "@/lib/classes/datetime";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function StudentClassesPage() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: upcomingClasses, error } = await getUpcomingClassesAction();

  // Group classes by Indian local date (YYYY-MM-DD in Asia/Kolkata)
  const groupedClassesMap = new Map<string, ClassScheduleItem[]>();
  for (const cls of upcomingClasses) {
    const dateKey = getISTDateKey(cls.starts_at);
    if (!groupedClassesMap.has(dateKey)) {
      groupedClassesMap.set(dateKey, []);
    }
    groupedClassesMap.get(dateKey)!.push(cls);
  }

  const dateGroups = Array.from(groupedClassesMap.entries()).map(([dateKey, items]) => ({
    dateKey,
    sampleIso: items[0].starts_at,
    classes: items.sort((a, b) => (a.starts_at > b.starts_at ? 1 : -1)),
  }));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Class Schedule</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Upcoming lecture sessions and classroom allocations. All times are displayed in Indian Standard Time (IST / Asia/Kolkata).
        </p>
      </div>

      {/* Fetch error graceful message */}
      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>Notice: Unable to refresh the class schedule at this moment. Please check back shortly.</span>
        </div>
      )}

      {/* Empty State */}
      {!error && dateGroups.length === 0 && (
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">No Upcoming Classes Scheduled</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            There are currently no upcoming lecture sessions scheduled. Check back later for updates from course faculty.
          </p>
        </Card>
      )}

      {/* Grouped Scheduled Classes */}
      {dateGroups.length > 0 && (
        <div className="space-y-8">
          {dateGroups.map(({ dateKey, sampleIso, classes }) => {
            const headingInfo = formatISTGroupHeading(dateKey, sampleIso);

            return (
              <section key={dateKey} className="space-y-3">
                {/* Date Group Heading */}
                <div className="flex items-baseline gap-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                    {headingInfo.heading}
                  </h2>
                  {headingInfo.subhead && (
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      — {headingInfo.subhead}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto font-mono">
                    {classes.length} {classes.length === 1 ? "class" : "classes"}
                  </span>
                </div>

                {/* Date Group Classes Table */}
                <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-5 py-3 w-48">Time</th>
                          <th className="px-5 py-3">Subject</th>
                          <th className="px-5 py-3 w-36 text-right sm:text-left">Classroom</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {classes.map((cls) => (
                          <tr key={cls.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/75 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-900 dark:text-slate-50">
                              {formatISTTimeRange(cls.starts_at, cls.ends_at)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-50">
                                {cls.subjects?.name || "Subject"}
                              </span>
                              {cls.subjects?.code && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2 font-mono">
                                  ({cls.subjects.code})
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap text-right sm:text-left">
                              <Badge
                                variant="secondary"
                                className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                              >
                                {cls.classroom}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
