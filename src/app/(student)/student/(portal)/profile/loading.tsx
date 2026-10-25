import React from "react";

export default function StudentProfileLoading() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Main Profile Info Card */}
      <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-52 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            </div>
          </div>
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded-md self-start sm:self-center" />
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* My Subjects Selection Card */}
      <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-80 max-w-full bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex items-start justify-between p-4 rounded-lg border border-slate-200/90 dark:border-slate-700/90 bg-white dark:bg-slate-900"
              >
                <div className="flex items-start space-x-3">
                  <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                  </div>
                </div>
                <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
          <div className="h-8 w-36 bg-slate-200 dark:bg-slate-700 rounded-md" />
        </div>
      </div>
    </div>
  );
}
