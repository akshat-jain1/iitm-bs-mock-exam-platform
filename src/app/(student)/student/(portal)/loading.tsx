import React from "react";

export default function StudentPortalLoading() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-10 animate-pulse">
      {/* Welcome Section */}
      <div>
        <div className="h-8 w-44 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-80 max-w-full bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Quick Access Section */}
      <section>
        <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="w-8 h-3 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Assessments Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-52 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs flex flex-col overflow-hidden"
            >
              <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="p-5 flex-1 space-y-3">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <div className="h-3.5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
                <div className="flex justify-between items-center py-1">
                  <div className="h-3.5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
                </div>
              </div>
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="h-9 w-full bg-slate-200 dark:bg-slate-700 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Results Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
          <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
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
    </div>
  );
}
