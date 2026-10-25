"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ExamResultsSummary } from "./actions";

interface ResultsListClientProps {
  exams: ExamResultsSummary[];
}

export function ResultsListClient({ exams }: ResultsListClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredExams = exams.filter((exam) => {
    const q = searchTerm.toLowerCase();
    return (
      exam.title.toLowerCase().includes(q) ||
      exam.assessment_type_name.toLowerCase().includes(q) ||
      exam.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Results & Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Authoritative examination performance, student result matrices, and grade analytics.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <div className="relative">
            <input
              type="text"
              placeholder="Search exams or types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 py-2 pl-9 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg">
        {filteredExams.length === 0 ? (
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">No examination records found</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {searchTerm ? "No examinations match your search query." : "No assessment events exist in the database."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Examination
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Date / Schedule
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Subjects
                </th>
                <th scope="col" className="px-6 py-3.5 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Submissions
                </th>
                <th scope="col" className="relative px-6 py-3.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {filteredExams.map((exam) => (
                <tr key={exam.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-50 text-sm">{exam.title}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{exam.id}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700 dark:text-slate-200">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                      {exam.assessment_type_name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                    {exam.scheduled_start ? (
                      new Date(exam.scheduled_start).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    ) : (
                      <span className="text-slate-400">Unscheduled</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <StatusBadge status={exam.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-medium text-slate-800 dark:text-slate-100">
                    {exam.subject_count}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {exam.total_submissions}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <Link
                      href={`/admin/results/${exam.id}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                    >
                      View Results
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
