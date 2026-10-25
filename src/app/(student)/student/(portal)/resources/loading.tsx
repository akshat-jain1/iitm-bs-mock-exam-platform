import React from "react";

export default function StudentResourcesLoading() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-60 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Subject Filter Bar */}
      <div className="space-y-3">
        <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <div className="h-7 w-28 bg-slate-200 dark:bg-slate-700 rounded-full shrink-0" />
          <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded-full shrink-0" />
          <div className="h-7 w-36 bg-slate-200 dark:bg-slate-700 rounded-full shrink-0" />
          <div className="h-7 w-28 bg-slate-200 dark:bg-slate-700 rounded-full shrink-0" />
          <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded-full shrink-0" />
        </div>
      </div>

      {/* Search & Type Filter Bar */}
      <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-80 h-9 bg-slate-100 dark:bg-slate-800 rounded-md" />
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-7 w-20 bg-slate-100 dark:bg-slate-800 rounded-md" />
          ))}
        </div>
      </div>

      {/* Resources Grid */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl shadow-xs flex flex-col justify-between overflow-hidden p-5 space-y-4 min-h-[220px]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-5 w-12 bg-slate-100 dark:bg-slate-800 rounded" />
                </div>
                <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-24 bg-slate-100 dark:bg-slate-800 rounded-full" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-4/5 bg-slate-100 dark:bg-slate-800 rounded" />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="h-3.5 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-7 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
