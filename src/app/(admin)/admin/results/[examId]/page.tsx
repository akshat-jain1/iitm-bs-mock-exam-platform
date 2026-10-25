import React from "react";
import Link from "next/link";
import { getExamDetailedResultsAction } from "../actions";
import { ExamResultsClient } from "./ExamResultsClient";

export const dynamic = "force-dynamic";

interface ExamResultsPageProps {
  params: Promise<{
    examId: string;
  }>;
}

export default async function ExamResultsPage({ params }: ExamResultsPageProps) {
  const { examId } = await params;
  const data = await getExamDetailedResultsAction(examId);

  if (!data) {
    return (
      <div className="py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Examination Not Found</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          The requested examination could not be found or you do not have permission to view its results.
        </p>
        <div>
          <Link
            href="/admin/results"
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
          >
            ← Return to Results & Analytics
          </Link>
        </div>
      </div>
    );
  }

  return <ExamResultsClient initialData={data} />;
}
