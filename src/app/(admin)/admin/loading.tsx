import React from "react";

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page Title & Quick Actions */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 bg-slate-200 dark:bg-slate-700 rounded-md" />
        <div className="flex space-x-3">
          <div className="h-9 w-32 bg-slate-200 dark:bg-slate-700 rounded-md" />
          <div className="h-9 w-40 bg-slate-200 dark:bg-slate-700 rounded-md" />
        </div>
      </div>

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Recent Assessment Events Table */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>

        <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-6 py-3 text-left"><div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></th>
                <th className="px-6 py-3 text-left"><div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded" /></th>
                <th className="px-6 py-3 text-left"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" /></th>
                <th className="px-6 py-3 text-left"><div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></th>
                <th className="px-6 py-3"><div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4">
                    <div className="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                    <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
                  </td>
                  <td className="px-6 py-4"><div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                  <td className="px-6 py-4"><div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
