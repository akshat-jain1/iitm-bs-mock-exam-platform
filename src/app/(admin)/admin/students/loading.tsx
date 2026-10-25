import React from "react";

export default function AdminStudentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>

      {/* Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-xl">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-36 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-right"><div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {[...Array(6)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                  <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
                </td>
                <td className="px-6 py-4">
                  <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
                    <div className="h-5 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
                    <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="h-8 w-28 bg-slate-200 dark:bg-slate-700 rounded-md ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
