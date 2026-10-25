import React from "react";

export default function AdminExamsLoading() {
  return (
    <div className="space-y-6 pb-12 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="space-y-2">
          <div className="h-8 w-72 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded-md" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center space-x-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="h-9 w-full max-w-sm bg-slate-100 dark:bg-slate-800 rounded-md" />
        <div className="h-9 w-32 bg-slate-100 dark:bg-slate-800 rounded-md" />
      </div>

      {/* Events Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-xl">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-left"><div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></th>
              <th className="px-6 py-3.5 text-right"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {[...Array(6)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <div className="h-4 w-52 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
                </td>
                <td className="px-6 py-4"><div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></td>
                <td className="px-6 py-4"><div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></td>
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
