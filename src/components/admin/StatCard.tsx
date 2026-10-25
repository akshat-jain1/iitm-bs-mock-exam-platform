import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
}

export function StatCard({ title, value, description }: StatCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 px-4 py-5 shadow-sm border border-slate-200 dark:border-slate-700 sm:p-6 font-sans">
      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{title}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{value}</dd>
      {description && (
        <dd className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</dd>
      )}
    </div>
  );
}
