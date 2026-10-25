import React from "react";

export default function AssessmentDetailsLoading() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-pulse">
      {/* Assessment Header */}
      <div>
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Subject Selection Card */}
      <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-72 max-w-full bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex items-start p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            >
              <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded mt-0.5 shrink-0" />
              <div className="ml-3 flex-1 space-y-1.5">
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ))}

          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1 mt-4">
            <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded" />
            <div className="h-3.5 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50 flex justify-between items-center">
          <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
        </div>
      </div>
    </div>
  );
}
