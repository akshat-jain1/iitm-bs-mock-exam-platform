import React from "react";

export default function AdminResourcesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-60 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-10 w-36 bg-slate-200 dark:bg-slate-700 rounded-md" />
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-xs ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-5 py-3 text-left"><div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-5 py-3 text-left"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-5 py-3 text-left"><div className="h-3 w-14 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-5 py-3 text-left"><div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-5 py-3 text-center"><div className="h-3 w-14 bg-slate-200 dark:bg-slate-700 rounded mx-auto" /></th>
              <th className="px-5 py-3 text-right"><div className="h-3 w-14 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {[...Array(6)].map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-4">
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                  <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800 rounded mb-1" />
                  <div className="h-2.5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
                </td>
                <td className="px-5 py-4"><div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></td>
                <td className="px-5 py-4"><div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                <td className="px-5 py-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></td>
                <td className="px-5 py-4 text-center"><div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto" /></td>
                <td className="px-5 py-4 text-right">
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
