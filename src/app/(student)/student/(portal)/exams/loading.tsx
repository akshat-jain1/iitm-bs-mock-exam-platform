import React from "react";

export default function StudentExamsLoading() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Page Header */}
      <div>
        <div className="h-8 w-60 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* Assessment Cards Grid */}
      <section>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
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
    </div>
  );
}
