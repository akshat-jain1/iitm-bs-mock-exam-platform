"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StudentExamResult, StudentExamHistorySession } from "./actions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface StudentResultsClientProps {
  isTester?: boolean;
  exams: StudentExamResult[];
  historySessions: StudentExamHistorySession[];
}

export function StudentResultsClient({ exams, historySessions, isTester = false }: StudentResultsClientProps) {
  const [activeTab, setActiveTab] = useState<"official" | "history">("official");
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "TEST" | "PRODUCTION">("ALL");
  const [expandedExamId, setExpandedExamId] = useState<string | null>(
    exams.length > 0 ? exams[0].examId : null
  );
  const [expandedHistorySessionId, setExpandedHistorySessionId] = useState<string | null>(null);

  const toggleExpand = (examId: string) => {
    setExpandedExamId((prev) => (prev === examId ? null : examId));
  };

  const toggleHistoryExpand = (sessionId: string) => {
    setExpandedHistorySessionId((prev) => (prev === sessionId ? null : sessionId));
  };

  // Official Metrics (Strictly production exams only)
  const totalExams = exams.length;
  const totalSubjects = exams.reduce((acc, e) => acc + e.subjectsCount, 0);
  const validPcts = exams.map((e) => e.overallPercentage).filter((p): p is number => p !== null);
  const avgPercentage = validPcts.length > 0
    ? (validPcts.reduce((a, b) => a + b, 0) / validPcts.length).toFixed(1)
    : null;

  // History Metrics & Filters
  const filteredHistory = historySessions.filter((s) => {
    if (historyFilter === "TEST") return s.isTest;
    if (historyFilter === "PRODUCTION") return !s.isTest;
    return true;
  });

  const totalHistoryCount = historySessions.length;
  const testHistoryCount = historySessions.filter((s) => s.isTest).length;
  const prodHistoryCount = historySessions.filter((s) => !s.isTest).length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Results &amp; Review</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Review your official examination results or review your submitted papers.
        </p>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-8">
        <button
          type="button"
          onClick={() => setActiveTab("official")}
          className={`pb-3.5 text-sm font-semibold flex items-center gap-2.5 border-b-2 transition-all cursor-pointer ${
            activeTab === "official"
              ? "border-blue-600 text-blue-700 dark:text-blue-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
          }`}
        >
          <span>Official Results</span>
          <Badge
            variant="secondary"
            className={`text-xs px-2 py-0.5 rounded-full font-mono ${
              activeTab === "official" ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {exams.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`pb-3.5 text-sm font-semibold flex items-center gap-2.5 border-b-2 transition-all cursor-pointer ${
            activeTab === "history"
              ? "border-blue-600 text-blue-700 dark:text-blue-300"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
          }`}
        >
          <span>Exam Review</span>
          <Badge
            variant="secondary"
            className={`text-xs px-2 py-0.5 rounded-full font-mono ${
              activeTab === "history" ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {historySessions.length}
          </Badge>
        </button>
      </div>

      {/* TAB 1: OFFICIAL RESULTS */}
      {activeTab === "official" && (
        <div className="space-y-8">
          {/* Top Metrics Cards (Production Exams Only) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Exams Evaluated
              </span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-50 block">{totalExams}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Completed assessments</span>
            </Card>

            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Subjects Evaluated
              </span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-50 block">{totalSubjects}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Individual subject papers</span>
            </Card>

            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Average Score %
              </span>
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-300 block">
                {avgPercentage !== null ? `${avgPercentage}%` : "NA"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Cumulative performance</span>
            </Card>
          </div>

          {/* Results List */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Evaluated Assessments</h2>

            {exams.length === 0 ? (
              <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-1">No Evaluated Results Yet</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
                  You have no published examination results at this time. Once an assessment evaluation is finalized by faculty administrators, your official scores will appear here.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {exams.map((exam) => {
                  const isExpanded = expandedExamId === exam.examId;
                  return (
                    <Card
                      key={exam.examId}
                      className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all"
                    >
                      <CardHeader className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 p-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                {exam.assessmentType}
                              </Badge>
                              <Badge className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs font-semibold" variant="outline">
                                Evaluated
                              </Badge>
                            </div>
                            <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-50">{exam.examTitle}</CardTitle>
                            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                              Evaluated on:{" "}
                              {exam.evaluatedAt
                                ? new Date(exam.evaluatedAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Published"}
                            </CardDescription>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                                Overall Score
                              </span>
                              <span className="text-lg font-bold text-slate-900 dark:text-slate-50">
                                {exam.overallScore}
                                <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                                  {" "}
                                  / {exam.overallMaxMarks > 0 ? exam.overallMaxMarks : "—"}
                                </span>
                              </span>
                              {exam.overallPercentage !== null && (
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 block">
                                  ({exam.overallPercentage.toFixed(1)}%)
                                </span>
                              )}
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleExpand(exam.examId)}
                              className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50 text-xs font-semibold shrink-0"
                            >
                              {isExpanded ? "Hide Details" : "View Details"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {/* Expanded Subject Breakdown Table */}
                      {isExpanded && (
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                              <thead className="bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <tr>
                                  <th scope="col" className="px-6 py-3 text-left">
                                    Subject
                                  </th>
                                  <th scope="col" className="px-6 py-3 text-left">
                                    Code
                                  </th>
                                  <th scope="col" className="px-6 py-3 text-right">
                                    Marks Obtained
                                  </th>
                                  <th scope="col" className="px-6 py-3 text-right">
                                    Max Marks
                                  </th>
                                  <th scope="col" className="px-6 py-3 text-right">
                                    Percentage
                                  </th>
                                  <th scope="col" className="px-6 py-3 text-center">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {exam.subjectResults.map((sub) => (
                                  <tr key={sub.attemptId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                                    <td className="px-6 py-3.5 font-medium text-slate-900 dark:text-slate-50">
                                      {sub.subjectName}
                                    </td>
                                    <td className="px-6 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {sub.subjectCode}
                                    </td>
                                    <td className="px-6 py-3.5 text-right font-semibold text-slate-900 dark:text-slate-50">
                                      {sub.score}
                                    </td>
                                    <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-300">
                                      {sub.maxMarks > 0 ? sub.maxMarks : "NA"}
                                    </td>
                                    <td className="px-6 py-3.5 text-right font-medium">
                                      {sub.percentage !== null ? (
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                            sub.percentage >= 70
                                              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                              : sub.percentage >= 40
                                              ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                              : "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                                          }`}
                                        >
                                          {sub.percentage.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-mono text-xs">NA</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-3.5 text-center">
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                                      >
                                        {sub.status}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: EXAM HISTORY & ANSWER REVIEW */}
      {activeTab === "history" && (
        <div className="space-y-6">
          {/* History Controls & Counts */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Exam Review</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isTester ? "Review completed test assignments and exams." : "Review your completed exam papers."} Correct answers are revealed only when you ask.
              </p>
            </div>

            {/* Assignment filters are only relevant to testers. */}
            {isTester && <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setHistoryFilter("ALL")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  historyFilter === "ALL"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
                }`}
              >
                All ({totalHistoryCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("TEST")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  historyFilter === "TEST"
                    ? "bg-white dark:bg-slate-900 text-purple-900 dark:text-purple-200 font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
                }`}
              >
                Test Assignments ({testHistoryCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("PRODUCTION")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  historyFilter === "PRODUCTION"
                    ? "bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-200 font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50"
                }`}
              >
                Production Exams ({prodHistoryCount})
              </button>
            </div>}
          </div>

          {/* History Sessions List */}
          {filteredHistory.length === 0 ? (
            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-1">No Completed Attempts Found</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
                {!isTester ? "You have not completed any exams yet." : historyFilter === "ALL"
                  ? "You have not completed any practice test assignments or examination attempts yet."
                  : historyFilter === "TEST"
                  ? "You have no completed practice test attempts."
                  : "You have no completed production examination attempts."}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((session) => {
                const isExpanded = expandedHistorySessionId === session.sessionId;
                const isMultiSubject = session.subjects.length > 1;
                const subjectNames = session.subjects.map((s) => s.subjectName).join(", ");

                return (
                  <Card
                    key={session.sessionId}
                    className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all hover:border-slate-300 dark:hover:border-slate-600"
                  >
                    <CardHeader className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 p-5">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          {/* Badges row */}
                          <div className="flex flex-wrap items-center gap-2">
                            {session.isTest ? (
                              <Badge className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-xs font-semibold" variant="outline">
                                Test Assignment
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs font-semibold" variant="outline">
                                {isTester ? "Production Exam" : "Exam"}
                              </Badge>
                            )}

                            <Badge variant="secondary" className="font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                              Attempt #{session.attemptNumber}
                            </Badge>

                            {session.status === "Evaluated" ? (
                              <Badge className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs font-semibold" variant="outline">
                                Evaluated
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-xs font-semibold" variant="outline">
                                Pending Review
                              </Badge>
                            )}
                          </div>

                          {/* Title & Subjects */}
                          <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            {session.assessmentTitle}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              <strong className="text-slate-700 dark:text-slate-200">Subjects:</strong> {subjectNames}
                            </span>
                            <span>•</span>
                            <span>
                              Completed:{" "}
                              {session.completedAt
                                ? new Date(session.completedAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Completed"}
                            </span>
                          </div>
                        </div>

                        {/* Marks & Actions */}
                        <div className="flex items-center justify-between lg:justify-end gap-6 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                          <div className="text-right">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                              Total Score
                            </span>
                            <span className="text-lg font-bold text-slate-900 dark:text-slate-50">
                              {session.overallScore}
                              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                                {" "}
                                / {session.overallMaxMarks > 0 ? session.overallMaxMarks : "—"}
                              </span>
                            </span>
                            {session.overallPercentage !== null && (
                              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 block">
                                ({session.overallPercentage.toFixed(1)}%)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Review Answers Button */}
                            {session.canReviewAnswers ? (
                              <Link href={`/student/results/review/${session.primaryAttemptId}`}>
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs"
                                >
                                  Review paper →
                                </Button>
                              </Link>
                            ) : (
                              <div className="relative group">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled
                                  className="text-xs opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700"
                                >
                                  Review Unavailable
                                </Button>
                                {session.reviewBlockedReason && (
                                  <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block z-10 w-52 p-2 bg-slate-900 text-white text-[11px] rounded shadow-lg text-center">
                                    {session.reviewBlockedReason}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Multi-subject accordion toggle */}
                            {isMultiSubject && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleHistoryExpand(session.sessionId)}
                                className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shrink-0"
                              >
                                {isExpanded ? "Hide Subjects" : "Subjects"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Multi-Subject Breakdown (When expanded) */}
                    {isMultiSubject && isExpanded && (
                      <CardContent className="p-0 border-t border-slate-100 dark:border-slate-800">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              <tr>
                                <th scope="col" className="px-6 py-2.5 text-left">Subject</th>
                                <th scope="col" className="px-6 py-2.5 text-left">Code</th>
                                <th scope="col" className="px-6 py-2.5 text-right">Score</th>
                                <th scope="col" className="px-6 py-2.5 text-right">Max</th>
                                <th scope="col" className="px-6 py-2.5 text-right">Percentage</th>
                                <th scope="col" className="px-6 py-2.5 text-center">Status</th>
                                <th scope="col" className="px-6 py-2.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                              {session.subjects.map((sub) => (
                                <tr key={sub.attemptId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-50">{sub.subjectName}</td>
                                  <td className="px-6 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{sub.subjectCode}</td>
                                  <td className="px-6 py-3 text-right font-semibold text-slate-900 dark:text-slate-50">{sub.score}</td>
                                  <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-300">{sub.maxMarks}</td>
                                  <td className="px-6 py-3 text-right font-medium">
                                    {sub.percentage !== null ? `${sub.percentage.toFixed(1)}%` : "NA"}
                                  </td>
                                  <td className="px-6 py-3 text-center">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        sub.status === "Evaluated"
                                          ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                          : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                      }`}
                                    >
                                      {sub.status}
                                    </Badge>
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    {sub.canReviewAnswers ? (
                                      <Link
                                        href={`/student/results/review/${sub.attemptId}`}
                                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                                      >
                                        Review {sub.subjectName} →
                                      </Link>
                                    ) : (
                                      <span className="text-xs text-slate-400">Locked</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
