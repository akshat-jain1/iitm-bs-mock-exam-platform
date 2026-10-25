"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  ExamDetailedResults,
  StudentIntegritySummary,
  IntegrityEventItem,
  getSubjectQuestionWiseResultsAction,
  SubjectQuestionWiseData,
  QuestionColumnMetadata,
  QuestionAttemptStatus,
} from "../actions";
import { IntegrityInspectionModal, IntegrityBadge } from "@/components/admin/IntegrityInspectionModal";
import { getIntegrityStatus } from "@/lib/exam-integrity/config";
import {
  calculateSubjectAnalytics,
  generateOverallExamCsv,
  generateSubjectCsv,
  downloadCsv,
  sanitizeFilename,
  StudentMatrixRow,
  SubjectResultRow,
} from "@/lib/results/exportAndAnalytics";

interface ExamResultsClientProps {
  initialData: ExamDetailedResults;
}

type SortField = "name" | "marks" | "percentage" | "submittedAt";
type SortDirection = "asc" | "desc";

export function ExamResultsClient({ initialData }: ExamResultsClientProps) {
  const { exam, subjects, entries } = initialData;

  // Selected Subject ID: null indicates "All Subjects" matrix
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Phase 3: Question-wise data cache per assessment_subject_id
  const [questionWiseDataMap, setQuestionWiseDataMap] = useState<Record<string, SubjectQuestionWiseData>>({});
  const [isLoadingQuestionWise, setIsLoadingQuestionWise] = useState(false);
  const [questionWiseError, setQuestionWiseError] = useState<string | null>(null);

  // Search filter for students
  const [studentSearch, setStudentSearch] = useState("");

  // Integrity audit inspection modal state
  const [inspectedStudent, setInspectedStudent] = useState<{
    studentName: string;
    studentEmail: string;
    subjectName?: string;
    summary: StudentIntegritySummary;
  } | null>(null);

  // Subject selector dropdown state & search
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sorting state for subject-specific table
  const [sortField, setSortField] = useState<SortField>("marks");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSubjectDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered list of subjects for selector
  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.toLowerCase().trim();
    if (!q) return subjects;
    return subjects.filter(
      (s) => s.subject_name.toLowerCase().includes(q) || s.subject_code.toLowerCase().includes(q)
    );
  }, [subjects, subjectSearch]);

  const activeSubject = useMemo(() => {
    if (!selectedSubjectId) return null;
    return subjects.find((s) => s.subject_id === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  // Build matrix rows for Overall View
  const matrixData = useMemo(() => {
    const studentMap = new Map<string, StudentMatrixRow>();

    // Collect all students who have any attempt in this exam
    entries.forEach((e) => {
      if (!studentMap.has(e.student_id)) {
        studentMap.set(e.student_id, {
          studentId: e.student_id,
          studentName: e.student_name,
          studentEmail: e.student_email,
          scoresBySubject: {},
        });
      }
      const row = studentMap.get(e.student_id)!;
      const existing = row.scoresBySubject[e.subject_id];
      if (!existing || (e.attempt_number >= (existing.attemptNumber || 1))) {
        row.scoresBySubject[e.subject_id] = {
          attemptId: e.attempt_id,
          attemptNumber: e.attempt_number,
          score: e.score,
          maxMarks: subjects.find((s) => s.subject_id === e.subject_id)?.max_marks || 0,
          status: e.attempt_status,
          submittedAt: e.end_time,
          integrity: e.integrity_summary,
        };
      }
    });

    const rows = Array.from(studentMap.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );

    // Compute aggregated overall integrity per student across all attempts in this exam
    rows.forEach((row) => {
      let fullscreen_exits = 0;
      let tab_window_leaves = 0;
      let copy_paste_attempts = 0;
      let total_events = 0;
      const allEvents: IntegrityEventItem[] = [];

      Object.values(row.scoresBySubject).forEach((s) => {
        if (s.integrity) {
          fullscreen_exits += s.integrity.fullscreen_exits;
          tab_window_leaves += s.integrity.tab_window_leaves;
          copy_paste_attempts += s.integrity.copy_paste_attempts;
          total_events += s.integrity.total_events;
          allEvents.push(...s.integrity.events);
        }
      });

      allEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      row.overallIntegrity = {
        fullscreen_exits,
        tab_window_leaves,
        copy_paste_attempts,
        total_events,
        status: getIntegrityStatus(total_events),
        events: allEvents,
      };
    });

    return rows;
  }, [entries, subjects]);

  // Overall Exam Analytics
  const examAnalytics = useMemo(() => {
    const totalSubmissions = entries.length;
    const uniqueStudents = matrixData.length;
    const completedSubmissions = entries.filter((e) => e.attempt_status === "Completed").length;

    return {
      totalSubmissions,
      uniqueStudents,
      subjectCount: subjects.length,
      completedSubmissions,
    };
  }, [entries, matrixData, subjects]);

  const handleSelectSubject = (subjectId: string | null) => {
    setSelectedSubjectId(subjectId);
    setIsSubjectDropdownOpen(false);
    setSubjectSearch("");
    setQuestionWiseError(null);

    if (!subjectId) return;
    const subj = subjects.find((s) => s.subject_id === subjectId);
    if (!subj) return;

    const asubId = subj.assessment_subject_id;
    if (questionWiseDataMap[asubId]) return;

    setIsLoadingQuestionWise(true);
    getSubjectQuestionWiseResultsAction(exam.id, asubId)
      .then((data) => {
        if (data) {
          setQuestionWiseDataMap((prev) => ({ ...prev, [asubId]: data }));
        } else {
          setQuestionWiseError("Unable to load question breakdown for this subject. Please retry.");
        }
      })
      .catch((err) => {
        console.error("Error loading question-wise results:", err);
        setQuestionWiseError("Unable to load question breakdown for this subject. Please retry.");
      })
      .finally(() => {
        setIsLoadingQuestionWise(false);
      });
  };

  // Fallback effect: ensure question-wise data is loaded if active subject changes externally
  useEffect(() => {
    if (!selectedSubjectId || !activeSubject) return;
    const asubId = activeSubject.assessment_subject_id;
    if (questionWiseDataMap[asubId]) return;

    let isMounted = true;
    getSubjectQuestionWiseResultsAction(exam.id, asubId)
      .then((data) => {
        if (isMounted) {
          if (data) {
            setQuestionWiseDataMap((prev) => ({ ...prev, [asubId]: data }));
          } else {
            setQuestionWiseError("Unable to load question breakdown for this subject. Please retry.");
          }
        }
      })
      .catch((err) => {
        console.error("Error loading question-wise results:", err);
        if (isMounted) {
          setQuestionWiseError("Unable to load question breakdown for this subject. Please retry.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubjectId, activeSubject, exam.id, questionWiseDataMap]);

  const currentQData = activeSubject ? questionWiseDataMap[activeSubject.assessment_subject_id] : null;
  const questions = currentQData?.questions || [];

  // Subject-specific Rows and Analytics
  const subjectRows = useMemo<SubjectResultRow[]>(() => {
    if (!selectedSubjectId || !activeSubject) return [];

    const rows: SubjectResultRow[] = entries
      .filter((e) => e.subject_id === selectedSubjectId)
      .map((e) => {
        const pct =
          e.score !== null && activeSubject.max_marks > 0
            ? (e.score / activeSubject.max_marks) * 100
            : null;

        const attemptStatuses = currentQData?.attemptQuestionStatuses?.[e.attempt_id];
        const qStatusesRecord: Record<string, string> = {};
        if (attemptStatuses) {
          Object.entries(attemptStatuses).forEach(([qId, s]) => {
            qStatusesRecord[qId] = s.status;
          });
        }

        return {
          studentName: e.student_name,
          studentEmail: e.student_email,
          subjectName: activeSubject.subject_name,
          attemptNumber: e.attempt_number,
          score: e.score,
          maxMarks: activeSubject.max_marks,
          percentage: pct !== null ? Math.round(pct * 10) / 10 : null,
          status: e.attempt_status,
          submittedAt: e.end_time,
          attemptId: e.attempt_id,
          integrity_summary: e.integrity_summary,
          questionStatuses: qStatusesRecord,
        };
      });

    return rows;
  }, [entries, selectedSubjectId, activeSubject, currentQData]);

  const subjectAnalytics = useMemo(() => {
    if (!activeSubject) return null;
    const scores = subjectRows.map((r) => r.score);
    return calculateSubjectAnalytics(scores, activeSubject.max_marks);
  }, [subjectRows, activeSubject]);

  // Filtered & Sorted Subject Rows
  const displayedSubjectRows = useMemo(() => {
    let list = [...subjectRows];
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase().trim();
      list = list.filter(
        (r) => r.studentName.toLowerCase().includes(q) || r.studentEmail.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortField === "name") {
        const comp = a.studentName.localeCompare(b.studentName, undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? comp : -comp;
      }

      if (sortField === "marks") {
        if (a.score === null && b.score === null) {
          return a.studentName.localeCompare(b.studentName, undefined, { numeric: true });
        }
        if (a.score === null) return 1; // NA/null scores always placed at the bottom
        if (b.score === null) return -1;
        if (a.score !== b.score) {
          return sortDirection === "desc" ? b.score - a.score : a.score - b.score;
        }
        return a.studentName.localeCompare(b.studentName, undefined, { numeric: true });
      }

      if (sortField === "percentage") {
        if (a.percentage === null && b.percentage === null) {
          return a.studentName.localeCompare(b.studentName, undefined, { numeric: true });
        }
        if (a.percentage === null) return 1;
        if (b.percentage === null) return -1;
        if (a.percentage !== b.percentage) {
          return sortDirection === "desc" ? b.percentage - a.percentage : a.percentage - b.percentage;
        }
        return a.studentName.localeCompare(b.studentName, undefined, { numeric: true });
      }

      if (sortField === "submittedAt") {
        const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        if (tA !== tB) {
          return sortDirection === "desc" ? tB - tA : tA - tB;
        }
        return a.studentName.localeCompare(b.studentName, undefined, { numeric: true });
      }

      return 0;
    });

    return list;
  }, [subjectRows, studentSearch, sortField, sortDirection]);

  // Filtered Overall Matrix Rows
  const displayedMatrixRows = useMemo(() => {
    if (!studentSearch.trim()) return matrixData;
    const q = studentSearch.toLowerCase().trim();
    return matrixData.filter(
      (r) => r.studentName.toLowerCase().includes(q) || r.studentEmail.toLowerCase().includes(q)
    );
  }, [matrixData, studentSearch]);

  // Sorting handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    const examSlug = sanitizeFilename(exam.title);

    if (selectedSubjectId && activeSubject) {
      // Export Subject-Specific CSV with dynamic question columns if available
      const subjectSlug = sanitizeFilename(activeSubject.subject_name);
      const filename = `${examSlug}-${subjectSlug}-results.csv`;
      const qHeaders = currentQData?.questions?.map((q) => ({
        id: q.id,
        label: `Q${q.sequenceNumber} (${q.type})`,
      }));
      const csv = generateSubjectCsv(subjectRows, qHeaders);
      downloadCsv(filename, csv);
    } else {
      // Export Overall Matrix CSV
      const filename = `${examSlug}-overall-results.csv`;
      const subjectsList = subjects.map((s) => ({ id: s.subject_id, name: s.subject_name }));
      const csv = generateOverallExamCsv(matrixData, subjectsList);
      downloadCsv(filename, csv);
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/admin/results" className="hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
          Results & Analytics
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-md">{exam.title}</span>
      </nav>

      {/* Exam Header */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{exam.title}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {exam.assessment_type_name}
            </span>
            {exam.assignment_type === "TEST" && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                TEST ASSIGNMENT
              </span>
            )}
            <StatusBadge status={exam.status} />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>
              Schedule:{" "}
              {exam.scheduled_start
                ? new Date(exam.scheduled_start).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Unscheduled"}
            </span>
            <span>•</span>
            <span className="font-mono text-slate-400">ID: {exam.id}</span>
          </div>
        </div>

        {/* Global Export Button */}
        <div>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV ({selectedSubjectId && activeSubject ? activeSubject.subject_name : "All Subjects"})
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      {!selectedSubjectId ? (
        // Exam-Level Analytics
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recorded Submissions</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{examAnalytics.totalSubmissions}</div>
            <div className="text-xs text-slate-400 mt-0.5">Across all subjects</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unique Students</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{examAnalytics.uniqueStudents}</div>
            <div className="text-xs text-slate-400 mt-0.5">With recorded attempts</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Configured Subjects</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{examAnalytics.subjectCount}</div>
            <div className="text-xs text-slate-400 mt-0.5">Active papers in exam</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed Attempts</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{examAnalytics.completedSubmissions}</div>
            <div className="text-xs text-slate-400 mt-0.5">Finalized status</div>
          </div>
        </div>
      ) : (
        // Subject-Specific Analytics
        activeSubject && subjectAnalytics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Submissions</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{subjectAnalytics.recordedSubmissions}</div>
              <div className="text-xs text-slate-400 mt-0.5">Evaluated attempts</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Average</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {subjectAnalytics.averageMarks !== null ? subjectAnalytics.averageMarks : "NA"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {subjectAnalytics.averageMarks === null
                  ? "No scores"
                  : subjectAnalytics.averagePercentage !== null
                  ? `${subjectAnalytics.averagePercentage}%`
                  : "N/A"}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Highest Score</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {subjectAnalytics.highestMarks !== null
                  ? activeSubject.max_marks > 0
                    ? `${subjectAnalytics.highestMarks} / ${activeSubject.max_marks}`
                    : `${subjectAnalytics.highestMarks}`
                  : "NA"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Top score</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lowest Score</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {subjectAnalytics.lowestMarks !== null
                  ? activeSubject.max_marks > 0
                    ? `${subjectAnalytics.lowestMarks} / ${activeSubject.max_marks}`
                    : `${subjectAnalytics.lowestMarks}`
                  : "NA"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Minimum recorded</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Median</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                {subjectAnalytics.medianMarks !== null ? subjectAnalytics.medianMarks : "NA"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">50th percentile</div>
            </div>
          </div>
        )
      )}

      {/* Toolbar: Scalable Subject Selector & Student Filter */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left: Scalable Subject Selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
            Subject / Paper:
          </label>
          <div className="relative" ref={dropdownRef}>
            <button
              id="subject-paper-selector-btn"
              type="button"
              onClick={() => setIsSubjectDropdownOpen((prev) => !prev)}
              className="inline-flex items-center justify-between w-64 md:w-72 px-3.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors text-left"
            >
              <span className="truncate">
                {activeSubject ? activeSubject.subject_name : "All Subjects (Overview Matrix)"}
              </span>
              <svg className="w-4 h-4 ml-2 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isSubjectDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-80 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                {/* Search input inside dropdown */}
                <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search subjects..."
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 pl-7 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <svg
                      className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Vertically scrollable subject list */}
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  <button
                    type="button"
                    onClick={() => handleSelectSubject(null)}
                    className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors ${
                      selectedSubjectId === null ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-medium">All Subjects</div>
                      <div className="text-xs text-slate-400">Complete student × paper matrix</div>
                    </div>
                    {selectedSubjectId === null && (
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {filteredSubjects.map((s) => {
                    const isSelected = selectedSubjectId === s.subject_id;
                    return (
                      <button
                        key={s.subject_id}
                        id={`subject-option-${s.subject_code}`}
                        type="button"
                        onClick={() => handleSelectSubject(s.subject_id)}
                        className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors ${
                          isSelected ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold" : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-50">{s.subject_name}</div>
                          <div className="text-xs text-slate-400">
                            {s.subject_code} • Max Marks: {s.max_marks}
                          </div>
                        </div>
                        {isSelected && (
                          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}

                  {filteredSubjects.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">No subjects match search</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Search Filter */}
        <div className="w-full sm:w-64">
          <div className="relative">
            <input
              id="student-search-input"
              type="text"
              placeholder="Filter by student name / email..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 pl-8 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
            <svg
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {!selectedSubjectId ? (
        // ====================================================================
        // VIEW A: Overall Student × Subject Matrix
        // ====================================================================
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Overall Student Performance Matrix
              <span className="ml-2 font-normal text-xs text-slate-500 dark:text-slate-400">
                ({displayedMatrixRows.length} {displayedMatrixRows.length === 1 ? "student" : "students"})
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Scroll horizontally to view all subjects • Missing results marked as <span className="font-semibold text-slate-600 dark:text-slate-300">NA</span>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-separate border-spacing-0">
              <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0 z-30">
                <tr>
                  {/* Sticky Student Column Header */}
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-40 bg-slate-100 dark:bg-slate-800 px-5 py-3.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider border-b border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] min-w-[220px]"
                  >
                    Student
                  </th>

                  {/* Integrity Activity Column Header */}
                  <th
                    scope="col"
                    className="px-4 py-3.5 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider border-b border-r border-slate-200 dark:border-slate-700 min-w-[130px] whitespace-nowrap bg-slate-50 dark:bg-slate-950"
                  >
                    Integrity Activity
                  </th>

                  {/* Subject Columns */}
                  {subjects.map((s) => (
                    <th
                      key={s.subject_id}
                      scope="col"
                      className="px-4 py-3.5 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 min-w-[140px] whitespace-nowrap bg-slate-50 dark:bg-slate-950"
                    >
                      <div>{s.subject_name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">Max: {s.max_marks}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {displayedMatrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={subjects.length + 2} className="py-12 text-center text-slate-400 text-sm">
                      No student results match the filter.
                    </td>
                  </tr>
                ) : (
                  displayedMatrixRows.map((row) => (
                    <tr key={row.studentId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors">
                      {/* Sticky Student Cell */}
                      <td className="sticky left-0 z-20 bg-white dark:bg-slate-900 px-5 py-3 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{row.studentName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{row.studentEmail}</div>
                      </td>

                      {/* Integrity Activity Badge */}
                      <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-700">
                        <IntegrityBadge
                          summary={row.overallIntegrity}
                          onClick={() =>
                            row.overallIntegrity &&
                            setInspectedStudent({
                              studentName: row.studentName,
                              studentEmail: row.studentEmail,
                              summary: row.overallIntegrity,
                            })
                          }
                        />
                      </td>

                      {/* Marks per Subject */}
                      {subjects.map((s) => {
                        const cell = row.scoresBySubject[s.subject_id];
                        const hasScore = cell && cell.score !== null;

                        return (
                          <td key={s.subject_id} className="px-4 py-3 text-center whitespace-nowrap">
                            {hasScore ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                  {cell.score}
                                </span>
                                {s.max_marks > 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    {Math.round((cell.score! / s.max_marks) * 100)}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                                NA
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ====================================================================
        // VIEW B: Subject-Specific Results Table with Dynamic Question Columns
        // ====================================================================
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {activeSubject?.subject_name} ({activeSubject?.subject_code})
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Maximum Marks: {activeSubject?.max_marks} • Showing {displayedSubjectRows.length} of {subjectRows.length} recorded submissions
                {questions.length > 0 && ` • ${questions.length} questions`}
              </div>
            </div>
            {/* Sort indicator info */}
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Sorted by{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {sortField === "marks"
                  ? "Marks"
                  : sortField === "name"
                  ? "Student Name"
                  : sortField === "percentage"
                  ? "Percentage"
                  : "Submitted At"}
              </span>{" "}
              (
              {sortField === "marks" || sortField === "percentage"
                ? sortDirection === "desc"
                  ? "High → Low"
                  : "Low → High"
                : sortField === "name"
                ? sortDirection === "asc"
                  ? "A → Z"
                  : "Z → A"
                : sortDirection === "desc"
                ? "Latest First"
                : "Earliest First"}
              )
            </div>
          </div>

          {/* Phase 3: Error Notification Banner if question breakdown loading failed */}
          {questionWiseError && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-rose-50 dark:bg-rose-950 border-b border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{questionWiseError}</span>
              </div>
              <button
                type="button"
                onClick={() => handleSelectSubject(selectedSubjectId)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium text-xs transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Phase 3: Accessible Question Correctness Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">Legend:</span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded flex items-center justify-center font-bold text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">✓</span> Correct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded flex items-center justify-center font-bold text-xs bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700">✕</span> Incorrect
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded flex items-center justify-center font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-400 border border-slate-200 dark:border-slate-700">—</span> Unanswered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded flex items-center justify-center font-semibold text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">⏳</span> Evaluation Pending
              </span>
              {currentQData?.attemptPaperVersionInfo &&
                Object.values(currentQData.attemptPaperVersionInfo).some((p) => p.isDifferentVersion) && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">⊘</span> Not in Paper
                  </span>
                )}
            </div>

            {isLoadingQuestionWise && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Loading question breakdown...</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[650px]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-separate border-spacing-0">
              <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0 z-30">
                <tr>
                  {/* Sticky Student Column Header */}
                  <th
                    scope="col"
                    className="p-0 text-left border-b border-r border-slate-200 dark:border-slate-700 sticky left-0 top-0 z-40 bg-slate-100 dark:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.04)] min-w-[220px] max-w-[260px]"
                    aria-sort={sortField === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      id="sort-name-btn"
                      type="button"
                      onClick={() => handleSort("name")}
                      aria-label={`Sort by student name, currently ${sortField === "name" ? (sortDirection === "asc" ? "A to Z" : "Z to A") : "not sorted"}`}
                      className="w-full px-5 py-3.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset active:bg-slate-300 dark:active:bg-slate-600 transition-colors cursor-pointer select-none"
                    >
                      <span>STUDENT NAME</span>
                      <span className="font-bold text-slate-900 dark:text-slate-50">
                        {sortField === "name" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  </th>

                  {/* Sticky Marks Column Header */}
                  <th
                    scope="col"
                    className="p-0 text-center border-b border-r border-slate-200 dark:border-slate-700 sticky left-[220px] top-0 z-40 bg-slate-100 dark:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.04)] min-w-[110px]"
                    aria-sort={sortField === "marks" ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}
                  >
                    <button
                      id="sort-marks-btn"
                      type="button"
                      onClick={() => handleSort("marks")}
                      aria-label={`Sort by marks, currently ${sortField === "marks" ? (sortDirection === "desc" ? "high to low" : "low to high") : "not sorted"}`}
                      className="w-full px-4 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset active:bg-slate-300 dark:active:bg-slate-600 transition-colors cursor-pointer select-none"
                    >
                      <span>MARKS ({activeSubject?.max_marks})</span>
                      <span className="font-bold text-slate-900 dark:text-slate-50">
                        {sortField === "marks" ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    </button>
                  </th>

                  {/* Percentage Column Header */}
                  <th
                    scope="col"
                    className="p-0 text-center border-b border-r border-slate-200 dark:border-slate-700 min-w-[100px] bg-slate-50 dark:bg-slate-950"
                    aria-sort={sortField === "percentage" ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}
                  >
                    <button
                      id="sort-percentage-btn"
                      type="button"
                      onClick={() => handleSort("percentage")}
                      aria-label={`Sort by percentage, currently ${sortField === "percentage" ? (sortDirection === "desc" ? "high to low" : "low to high") : "not sorted"}`}
                      className="w-full px-4 py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer select-none"
                    >
                      <span>PERCENTAGE</span>
                      <span className="font-bold text-slate-900 dark:text-slate-50">
                        {sortField === "percentage" ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    </button>
                  </th>

                  {/* Dynamic Question Columns (Q1, Q2, ... QN) */}
                  {questions.map((q) => (
                    <th
                      key={q.id}
                      scope="col"
                      title={`Question ${q.sequenceNumber} • ${q.type === "MCQ" ? "Multiple Choice" : q.type === "MSQ" ? "Multiple Select" : "Numerical"} • Max: ${q.marks} mark${q.marks === 1 ? "" : "s"}`}
                      className="px-1.5 py-3 text-center border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 min-w-[50px] w-[50px] max-w-[50px] whitespace-nowrap cursor-help select-none"
                    >
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Q{q.sequenceNumber}</div>
                      <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">{q.marks}m</div>
                    </th>
                  ))}

                  {/* Status Column Header */}
                  <th scope="col" className="px-4 py-3.5 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-r border-slate-200 dark:border-slate-700 min-w-[100px] whitespace-nowrap bg-slate-50 dark:bg-slate-950">
                    Status
                  </th>

                  {/* Submitted At Column Header */}
                  <th
                    scope="col"
                    className="p-0 text-right border-b border-slate-200 dark:border-slate-700 min-w-[130px] whitespace-nowrap bg-slate-50 dark:bg-slate-950"
                    aria-sort={sortField === "submittedAt" ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}
                  >
                    <button
                      id="sort-submitted-btn"
                      type="button"
                      onClick={() => handleSort("submittedAt")}
                      aria-label={`Sort by submitted at, currently ${sortField === "submittedAt" ? (sortDirection === "desc" ? "latest first" : "earliest first") : "not sorted"}`}
                      className="w-full px-5 py-3.5 flex items-center justify-end gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer select-none"
                    >
                      <span>SUBMITTED AT</span>
                      <span className="font-bold text-slate-900 dark:text-slate-50">
                        {sortField === "submittedAt" ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {displayedSubjectRows.length === 0 ? (
                  <tr>
                    <td colSpan={5 + questions.length} className="py-12 text-center text-slate-400 text-sm">
                      No student results recorded for this subject.
                    </td>
                  </tr>
                ) : (
                  displayedSubjectRows.map((r) => {
                    const isDiffVer = r.attemptId
                      ? currentQData?.attemptPaperVersionInfo?.[r.attemptId]?.isDifferentVersion
                      : false;

                    return (
                      <tr key={r.attemptId || `${r.studentEmail}-${r.attemptNumber || 1}`} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        {/* Sticky Student Cell */}
                        <td className="px-5 py-3 whitespace-nowrap sticky left-0 z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] min-w-[220px] max-w-[260px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{r.studentName}</span>
                            {exam.assignment_type === "TEST" && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                #{r.attemptNumber || 1}
                              </span>
                            )}
                            {isDiffVer && (
                              <span
                                className="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title="Attempt used a different paper version than currently configured"
                              >
                                v(alt)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{r.studentEmail}</div>
                        </td>

                        {/* Sticky Marks Cell */}
                        <td className="px-4 py-3 whitespace-nowrap text-center sticky left-[220px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.04)] min-w-[110px]">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-50">
                            {r.score !== null ? r.score : "NA"}
                          </span>
                          {r.score !== null && (
                            <span className="text-xs text-slate-400 ml-1">
                              / {r.maxMarks > 0 ? r.maxMarks : "NA"}
                            </span>
                          )}
                        </td>

                        {/* Percentage Cell */}
                        <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">
                          {r.percentage !== null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                r.percentage >= 75
                                  ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                  : r.percentage >= 50
                                  ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                  : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              }`}
                            >
                              {r.percentage.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">NA</span>
                          )}
                        </td>

                        {/* Dynamic Question Status Cells */}
                        {questions.map((q) => {
                          const statusObj = r.attemptId
                            ? currentQData?.attemptQuestionStatuses?.[r.attemptId]?.[q.id]
                            : undefined;
                          return (
                            <td
                              key={q.id}
                              className="px-1.5 py-2.5 text-center border-r border-slate-100 dark:border-slate-800 min-w-[50px] w-[50px] max-w-[50px] whitespace-nowrap"
                            >
                              {renderQuestionCell(q, statusObj, isLoadingQuestionWise)}
                            </td>
                          );
                        })}

                        {/* Status Cell */}
                        <td className="px-4 py-3 whitespace-nowrap text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px]">
                          <StatusBadge status={r.status} />
                        </td>

                        {/* Submitted At Cell */}
                        <td className="px-5 py-3 whitespace-nowrap text-right text-xs text-slate-500 dark:text-slate-400 font-medium min-w-[130px]">
                          {r.submittedAt
                            ? new Date(r.submittedAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "N/A"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrity Inspection Audit Modal */}
      <IntegrityInspectionModal
        isOpen={Boolean(inspectedStudent)}
        onClose={() => setInspectedStudent(null)}
        studentName={inspectedStudent?.studentName || ""}
        studentEmail={inspectedStudent?.studentEmail || ""}
        subjectName={inspectedStudent?.subjectName}
        summary={inspectedStudent?.summary || null}
      />
    </div>
  );
}

function renderQuestionCell(
  q: QuestionColumnMetadata,
  statusObj: QuestionAttemptStatus | undefined,
  isLoading: boolean
) {
  if (isLoading && !statusObj) {
    return (
      <span className="inline-block w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
    );
  }

  const status = statusObj?.status || "UNKNOWN";
  const title = `Q${q.sequenceNumber} (${q.type}): ${status} (${statusObj?.marksAwarded ?? 0}/${q.marks}m)${statusObj?.detail ? ` • ${statusObj.detail}` : ""}`;

  switch (status) {
    case "CORRECT":
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs cursor-help select-none"
        >
          ✓
        </span>
      );
    case "INCORRECT":
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-xs bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-2xs cursor-help select-none"
        >
          ✕
        </span>
      );
    case "UNANSWERED":
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-help select-none"
        >
          —
        </span>
      );
    case "PENDING":
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-semibold text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 cursor-help select-none"
        >
          ⏳
        </span>
      );
    case "NOT_APPLICABLE":
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-help select-none"
        >
          ⊘
        </span>
      );
    case "UNKNOWN":
    default:
      return (
        <span
          title={title}
          className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 cursor-help select-none"
        >
          ?
        </span>
      );
  }
}
