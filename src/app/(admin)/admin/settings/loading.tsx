import React from "react";

export default function AdminSettingsLoading() {
  return (
    <div className="space-y-6 max-w-4xl animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-4 w-72 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-9 w-28 bg-slate-200 dark:bg-slate-700 rounded-md" />
      </div>

      {/* Card 1: General Information */}
      <div className="bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5 space-y-1">
          <div className="h-5 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
          <div className="space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
        </div>
      </div>

      {/* Card 2: Examination Defaults */}
      <div className="bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5 space-y-1">
          <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-60 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded mt-0.5" />
            <div className="space-y-1">
              <div className="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded mt-0.5" />
            <div className="space-y-1">
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-72 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
