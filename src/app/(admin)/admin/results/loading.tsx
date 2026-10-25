import React from "react";

export default function AdminResultsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-60 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="w-full sm:w-72">
          <div className="h-9 w-full bg-slate-200 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-center"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded mx-auto" /></th>
              <th className="px-6 py-3.5 text-center"><div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded mx-auto" /></th>
              <th className="px-6 py-3.5 text-right"><div className="h-3 w-14 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {[...Array(6)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
                </td>
                <td className="px-6 py-4"><div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></td>
                <td className="px-6 py-4"><div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                <td className="px-6 py-4 text-center"><div className="h-4 w-8 bg-slate-200 dark:bg-slate-700 rounded mx-auto" /></td>
                <td className="px-6 py-4 text-center"><div className="h-4 w-8 bg-slate-200 dark:bg-slate-700 rounded mx-auto" /></td>
                <td className="px-6 py-4 text-right">
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
