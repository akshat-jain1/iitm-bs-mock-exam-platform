import React from "react";

export default function StudentResultsLoading() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Page Header */}
      <div>
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs p-5 space-y-2">
            <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Results List */}
      <section className="space-y-4">
        <div className="h-6 w-52 bg-slate-200 dark:bg-slate-700 rounded" />

        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden"
            >
              <div className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="h-6 w-60 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3.5 w-40 bg-slate-100 dark:bg-slate-800 rounded" />
                </div>

                <div className="flex items-center gap-6">
                  <div className="space-y-1 text-right">
                    <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded ml-auto" />
                    <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded ml-auto" />
                  </div>
                  <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
