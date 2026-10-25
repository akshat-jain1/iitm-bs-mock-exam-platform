import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getStudentResultsAction } from "./results/actions";
import { getUpcomingClassesAction } from "@/lib/classes/actions";
import {
  formatISTTimeRange,
  getISTDateKey,
  formatISTGroupHeading,
} from "@/lib/classes/datetime";
import { canAccessAssignment } from "@/lib/assessment-access";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";

export const dynamic = "force-dynamic";

interface AssessmentEvent {
  id: string;
  title: string;
  scheduled_start: string | null;
  status: string;
  assignment_type?: 'PRODUCTION' | 'TEST';
  test_access_mode?: 'TESTER_ONLY' | 'ALL_ENROLLED' | null;
  test_duration_mins?: number | null;
  assessment_types: { name: string } | { name: string }[] | null;
}

function RecentResultsSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs p-5 flex flex-col justify-between min-h-[150px]"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
              <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
              <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-2.5 w-10 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function RecentResultsSection() {
  const allResults = await getStudentResultsAction();
  const recentResults = allResults.slice(0, 2);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Recent Results</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Evaluated performance from finalized examinations.</p>
        </div>
        {allResults.length > 0 && (
          <Link href="/student/results" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            View all results ({allResults.length}) →
          </Link>
        )}
      </div>

      {recentResults.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-8 text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">No Evaluated Results Yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Completed assessments will appear here once official marks are evaluated and published by faculty.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {recentResults.map((result) => (
            <Card
              key={result.examId}
              className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm transition-shadow p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary" className="font-mono text-xs bg-slate-100 dark:bg-slate-800 border-0">
                    {result.assessmentType}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {result.evaluatedAt
                      ? new Date(result.evaluatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Evaluated"}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">{result.examTitle}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {result.subjectsCount} {result.subjectsCount === 1 ? "subject" : "subjects"} completed
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Score
                  </span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {result.overallScore}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {" "}
                      / {result.overallMaxMarks > 0 ? result.overallMaxMarks : "—"}
                    </span>
                  </span>
                  {result.overallPercentage !== null && (
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 ml-2">
                      ({result.overallPercentage.toFixed(1)}%)
                    </span>
                  )}
                </div>

                <Link href="/student/results">
                  <Button variant="outline" size="sm" className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs">
                    View Result →
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function StudentDashboard() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Concurrently fetch profile, assessments, active enrollments, and top 3 upcoming classes.
  // The slower results query is wrapped in <Suspense> below so the dashboard streams first.
  const [profileRes, assessmentsRes, enrollmentsRes, classesRes] = await Promise.all([
    supabase
      .from("users")
      .select("name, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("assessment_events")
      .select(`
        id,
        title,
        scheduled_start,
        status,
        assignment_type,
        test_access_mode,
        test_duration_mins,
        assessment_types ( name )
      `)
      .in("status", ["Live", "Scheduled"])
      .order("scheduled_start", { ascending: true }),
    supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", user.id)
      .eq("is_active", true),
    getUpcomingClassesAction({ limit: 3 }),
  ]);

  const profile = profileRes.data;
  const assessments = assessmentsRes.data;
  const activeEnrollmentsCount = enrollmentsRes.count ?? 0;
  const upcomingClasses = classesRes.data || [];

  if (assessmentsRes.error) {
    console.error("Error fetching assessments:", assessmentsRes.error);
  }

  const studentName = profile?.name || (user.user_metadata?.full_name as string) || "Student";
  const userRole = await getCachedUserRole(user, { skipJwtClaim: true });

  const upcomingAssessments = (assessments as AssessmentEvent[] | null)?.filter(a => {
    if (a.status !== 'Live' && a.status !== 'Scheduled') return false;
    if (a.title.startsWith("Phase 5") || a.title.startsWith("Phase 6")) return false;

    return canAccessAssignment(userRole, a.assignment_type || "PRODUCTION");
  }) || [];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-8 sm:space-y-10">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Welcome back, <span className="font-semibold text-slate-800 dark:text-slate-100">{studentName}</span>. Access your scheduled lectures, upcoming assessments, and evaluated results.
        </p>
      </div>

      {/* Banner if student has zero active enrollments */}
      {activeEnrollmentsCount === 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="text-xl leading-none mt-0.5 sm:mt-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                You haven&apos;t selected your term subjects yet
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Choose up to 4 subjects in your profile to be eligible for upcoming assessments.
              </p>
            </div>
          </div>
          <Link href="/student/profile" className="shrink-0 self-start sm:self-auto">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs">
              Select Subjects →
            </Button>
          </Link>
        </div>
      )}

      {/* Responsive Two-Column Layout: Left Column = Upcoming Classes, Right Column = Upcoming Assessments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left Column: Upcoming Classes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Upcoming Classes</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Next scheduled lecture sessions</p>
            </div>
            <Link
              href="/student/classes"
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              View All Classes →
            </Link>
          </div>

          {upcomingClasses.length === 0 ? (
            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-8 text-center flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">No Scheduled Classes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                No upcoming classes scheduled at this time. Check back later for updates.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcomingClasses.map((cls) => {
                const headingInfo = formatISTGroupHeading(getISTDateKey(cls.starts_at), cls.starts_at);

                return (
                  <Card
                    key={cls.id}
                    className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm transition-shadow p-4 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              headingInfo.isToday
                                ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {headingInfo.heading}
                          </span>
                          {headingInfo.subhead && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {headingInfo.subhead}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-50 text-sm">
                          {cls.subjects?.name || "Subject"}
                        </h3>
                        {cls.subjects?.code && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {cls.subjects.code}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                          Classroom
                        </span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                        >
                          {cls.classroom}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Time
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {formatISTTimeRange(cls.starts_at, cls.ends_at)}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Upcoming Assessments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Upcoming Assessments</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Examinations and tests</p>
            </div>
            <Link
              href="/student/exams"
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              View All Exams →
            </Link>
          </div>

          {upcomingAssessments.length === 0 ? (
            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-8 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">No Upcoming Assessments</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm mx-auto mt-1">
                You have no upcoming assessments scheduled at this time. Check back later.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcomingAssessments.map((a: AssessmentEvent) => {
                const typeName = Array.isArray(a.assessment_types) ? a.assessment_types[0]?.name : a.assessment_types?.name;
                const isLive = a.status === 'Live';
                return (
                  <Card key={a.id} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs flex flex-col hover:shadow-sm transition-shadow">
                    <CardHeader className="pb-2.5 pt-4 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="font-mono text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            {typeName || "Standard Exam"}
                          </Badge>
                          {a.assignment_type === 'TEST' && (
                            <Badge className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-[10px] font-bold uppercase tracking-wider">
                              TEST
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant={isLive ? 'default' : 'secondary'}
                          className={`text-[10px] uppercase tracking-wider font-semibold ${isLive ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
                        >
                          {a.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-50">{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 pb-3 px-4 flex-1 space-y-2">
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Scheduled</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-50">
                            {a.scheduled_start ? new Date(a.scheduled_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Duration</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-50 text-xs">
                            {a.assignment_type === 'TEST' && a.test_duration_mins
                              ? `${a.test_duration_mins} mins (Test Mode)`
                              : 'Calculated based on selected subjects'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2.5 pb-3 px-4 border-t border-slate-100 dark:border-slate-800">
                      <Link href={`/student/assessment/${a.id}`} className="w-full">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-medium text-xs">
                          View Eligible Subjects
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Recent Results Section - Streamed independently via Suspense */}
      <Suspense fallback={<RecentResultsSkeleton />}>
        <RecentResultsSection />
      </Suspense>
    </div>
  );
}
