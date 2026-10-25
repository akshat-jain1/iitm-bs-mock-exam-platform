import React from "react";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { canAccessAssignment, assignmentLabel } from "@/lib/assessment-access";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

interface AssessmentEvent {
  id: string;
  title: string;
  scheduled_start: string | null;
  status: string;
  assignment_type: string;
  assessment_types: { name: string } | { name: string }[] | null;
}

export default async function StudentExamsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const role = user ? await getCachedUserRole(user, { skipJwtClaim: true }) : "student";
  const isTester = role === "tester";

  const { data: assessments, error } = await supabase
    .from("assessment_events")
    .select(`
      id,
      title,
      scheduled_start,
      status,
      assignment_type,
      assessment_types ( name )
    `)
    .in("status", ["Live", "Scheduled"])
    .order("scheduled_start", { ascending: true });

  if (error) {
    console.error("Error fetching assessments:", error);
  }

  const upcomingAssessments = (assessments as AssessmentEvent[] | null)?.filter(a =>
    (a.status === 'Live' || a.status === 'Scheduled') &&
    !a.title.startsWith("Phase 5") &&
    !a.title.startsWith("Phase 6") &&
    canAccessAssignment(role, a.assignment_type)
  ) || [];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{isTester ? "Exams & test assignments" : "Exams"}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          View your scheduled and live exams. Choose an exam to check your subjects and get started.
        </p>
      </div>

      <section>
        {upcomingAssessments.length === 0 ? (
          <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-1">No Active Assessments</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
              There are currently no scheduled or live assessments available. Check back according to your academic timetable.
            </p>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingAssessments.map((a: AssessmentEvent) => {
              const typeName = Array.isArray(a.assessment_types) ? a.assessment_types[0]?.name : a.assessment_types?.name;
              const isLive = a.status === 'Live';
              return (
                <Card key={a.id} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        {isTester ? `${assignmentLabel(true, a.assignment_type === "TEST")} · ${typeName || "Assessment"}` : typeName || "Exam"}
                      </Badge>
                      <Badge 
                        variant={isLive ? 'default' : 'secondary'} 
                        className={`text-[10px] uppercase tracking-wider font-semibold ${isLive ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
                      >
                        {a.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-50">{a.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 flex-1 space-y-4">
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Scheduled</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-50">
                          {a.scheduled_start ? new Date(a.scheduled_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Duration</span>
                        <span className="font-semibold text-slate-500 dark:text-slate-400 italic text-xs mt-0.5">Calculated based on selected subjects</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Link href={`/student/assessment/${a.id}`} className="w-full">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium">
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
  );
}
