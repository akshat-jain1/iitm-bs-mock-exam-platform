/**
 * Utility functions for Results CSV Export and Analytics Calculations
 */

import { StudentIntegritySummary } from "@/app/(admin)/admin/results/actions";

export interface StudentMatrixRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  scoresBySubject: Record<string, {
    attemptId?: string;
    attemptNumber?: number;
    score: number | null;
    maxMarks: number;
    status?: string;
    submittedAt?: string | null;
    integrity?: StudentIntegritySummary;
  }>;
  overallIntegrity?: StudentIntegritySummary;
}

export interface SubjectAnalytics {
  recordedSubmissions: number;
  averageMarks: number | null;
  averagePercentage: number | null;
  highestMarks: number | null;
  lowestMarks: number | null;
  medianMarks: number | null;
  standardDeviation: number | null;
}

/**
 * Calculates statistical metrics for a set of numeric scores.
 * Ignores null / undefined (NA) values.
 */
export function calculateSubjectAnalytics(
  scores: (number | null)[],
  maxMarks: number
): SubjectAnalytics {
  const validScores = scores.filter((s): s is number => s !== null && !isNaN(s));

  if (validScores.length === 0) {
    return {
      recordedSubmissions: 0,
      averageMarks: null,
      averagePercentage: null,
      highestMarks: null,
      lowestMarks: null,
      medianMarks: null,
      standardDeviation: null,
    };
  }

  const count = validScores.length;
  const sum = validScores.reduce((acc, val) => acc + val, 0);
  const avg = sum / count;

  const sorted = [...validScores].sort((a, b) => a - b);
  let median = 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }

  const variance = validScores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const avgPct = maxMarks > 0 ? (avg / maxMarks) * 100 : null;

  return {
    recordedSubmissions: count,
    averageMarks: Math.round(avg * 100) / 100,
    averagePercentage: avgPct !== null ? Math.round(avgPct * 10) / 10 : null,
    highestMarks: sorted[sorted.length - 1],
    lowestMarks: sorted[0],
    medianMarks: Math.round(median * 100) / 100,
    standardDeviation: Math.round(stdDev * 100) / 100,
  };
}

/**
 * Sanitizes a string into a safe filename slug.
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Escapes a cell according to RFC 4180 CSV standard.
 */
export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds the Overall Exam CSV content.
 */
export function generateOverallExamCsv(
  matrixRows: StudentMatrixRow[],
  subjects: { id: string; name: string }[]
): string {
  const headers = ["Student Name", "Student Email", ...subjects.map((s) => s.name)];
  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const row of matrixRows) {
    const rowValues: (string | number)[] = [row.studentName, row.studentEmail];
    for (const subj of subjects) {
      const cell = row.scoresBySubject[subj.id];
      if (cell && cell.score !== null) {
        rowValues.push(cell.score);
      } else {
        rowValues.push("NA");
      }
    }
    lines.push(rowValues.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
}

export interface SubjectResultRow {
  studentName: string;
  studentEmail: string;
  subjectName: string;
  attemptNumber?: number;
  score: number | null;
  maxMarks: number;
  percentage: number | null;
  status: string;
  submittedAt: string | null;
  attemptId?: string;
  integrity_summary?: StudentIntegritySummary;
  questionStatuses?: Record<string, string>;
}

/**
 * Builds the Subject-Specific CSV content with optional question-wise columns.
 */
export function generateSubjectCsv(
  rows: SubjectResultRow[],
  questionHeaders?: Array<{ id: string; label: string }>
): string {
  const baseHeaders = [
    "Student Name",
    "Student Email",
    "Subject",
    "Attempt Number",
    "Marks",
    "Maximum Marks",
    "Percentage",
    "Status",
    "Submitted At",
  ];

  const qCols = questionHeaders || [];
  const headers = [...baseHeaders, ...qCols.map((q) => q.label)];
  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const row of rows) {
    const marksStr = row.score !== null ? row.score : "NA";
    const pctStr = row.percentage !== null ? `${row.percentage.toFixed(1)}%` : "NA";
    const dateStr = row.submittedAt ? new Date(row.submittedAt).toLocaleString("en-US") : "";

    const rowValues: (string | number)[] = [
      row.studentName,
      row.studentEmail,
      row.subjectName,
      row.attemptNumber ?? 1,
      marksStr,
      row.maxMarks,
      pctStr,
      row.status,
      dateStr,
    ];

    for (const q of qCols) {
      const qStatus = row.questionStatuses?.[q.id] || "NOT_APPLICABLE";
      rowValues.push(qStatus);
    }

    lines.push(rowValues.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
}

/**
 * Triggers a browser download of a CSV string.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
