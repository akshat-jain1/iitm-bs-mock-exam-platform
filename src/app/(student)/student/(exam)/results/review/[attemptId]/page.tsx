import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { getStudentAttemptReviewAction } from "@/app/(student)/student/(portal)/results/actions";
import { StudyPaperClient } from "@/components/student/study/StudyPaperClient";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

interface AttemptReviewPageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function AttemptReviewPage({ params }: AttemptReviewPageProps) {
  const user = await getCachedUser();
  if (!user) {
    redirect("/login");
  }

  const { attemptId } = await params;
  const reviewData = await getStudentAttemptReviewAction(attemptId);

  if (!reviewData.allowed) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 font-sans">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
          <Link href="/student/results" className="hover:text-slate-800 dark:hover:text-slate-100 flex items-center gap-1 font-medium">
            ← Back to Results &amp; Review
          </Link>
        </div>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/50 p-8 text-center space-y-4 rounded-xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto text-xl font-bold">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Answer Review Unavailable</h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm max-w-lg mx-auto">
            {reviewData.reason ||
              "Answer review is currently locked for this assessment attempt based on academic release policies."}
          </p>
          <div className="pt-2">
            <Link href="/student/results">
              <Button variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold">
                Return to Results &amp; Review
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <StudyPaperClient key={attemptId} review={reviewData} />;
}
