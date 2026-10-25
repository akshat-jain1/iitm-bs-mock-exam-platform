"use client";

import React from "react";
import { StudentIntegritySummary, IntegrityEventItem } from "@/app/(admin)/admin/results/actions";

interface IntegrityInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentEmail: string;
  subjectName?: string;
  summary: StudentIntegritySummary | null;
}

export function IntegrityInspectionModal({
  isOpen,
  onClose,
  studentName,
  studentEmail,
  subjectName,
  summary,
}: IntegrityInspectionModalProps) {
  if (!isOpen || !summary) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "High Activity":
        return "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 ring-rose-500/20";
      case "Attention":
        return "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 ring-amber-500/20";
      default:
        return "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 ring-emerald-500/20";
    }
  };

  const formatEventType = (type: string) => {
    switch (type) {
      case "fullscreen_exit":
        return { label: "Fullscreen Exited", color: "bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800" };
      case "fullscreen_enter":
        return { label: "Fullscreen Restored", color: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800" };
      case "visibility_lost":
        return { label: "Window / Tab Left", color: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800" };
      case "visibility_restored":
        return { label: "Window Returned", color: "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800" };
      case "window_blur":
        return { label: "Window Focus Lost", color: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800" };
      case "window_focus":
        return { label: "Window Focus Restored", color: "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800" };
      case "copy_attempt":
        return { label: "Copy Attempt", color: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800" };
      case "paste_attempt":
        return { label: "Paste Attempt", color: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800" };
      case "cut_attempt":
        return { label: "Cut Attempt", color: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800" };
      case "context_menu_attempt":
        return { label: "Right-Click Context Menu", color: "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800" };
      case "restricted_shortcut_attempt":
        return { label: "Restricted Shortcut Attempt", color: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800" };
      default:
        return { label: type, color: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700" };
    }
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Exam Integrity &amp; Invigilation Audit</h3>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ring-1 ${getStatusColor(
                  summary.status
                )}`}
              >
                {summary.status}
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{studentName}</span>
              <span>•</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">{studentEmail}</span>
              {subjectName && (
                <>
                  <span>•</span>
                  <span className="text-blue-600 dark:text-blue-400 font-medium">{subjectName}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Informative Disclaimer Banner */}
        <div className="px-5 py-2.5 bg-blue-50/60 dark:bg-blue-950/60 border-b border-blue-100/80 dark:border-blue-900/80 flex items-start gap-2.5 text-xs text-blue-800 dark:text-blue-200">
          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>Invigilator Note:</strong> Activity indicators assist human invigilators (TAs) in reviewing student behavior. They are browser-level signals and <strong>NOT automatic cheating verdicts</strong>.
          </span>
        </div>

        {/* Metric Cards Grid */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/30 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800">
          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <svg className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>Fullscreen Exits</span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{summary.fullscreen_exits}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <svg className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>Tab / Window Leaves</span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{summary.tab_window_leaves}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <svg className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <span>Copy / Paste Tries</span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{summary.copy_paste_attempts}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Total Events</span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{summary.total_events}</div>
          </div>
        </div>

        {/* Detailed Chronological Event Timeline */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Recorded Activity Timeline ({summary.events.length})
          </div>

          {summary.events.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <svg className="w-8 h-8 mx-auto mb-2 text-emerald-500/70 dark:text-emerald-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>No integrity signals recorded. Student maintained continuous exam focus.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.events.map((ev: IntegrityEventItem) => {
                const badge = formatEventType(ev.event_type);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50/70 dark:bg-slate-950/70 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded-lg border border-slate-200/60 dark:border-slate-700/60 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                          {JSON.stringify(ev.metadata)}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatTimestamp(ev.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}

export function IntegrityBadge({
  summary,
  onClick,
}: {
  summary?: StudentIntegritySummary;
  onClick?: () => void;
}) {
  if (!summary) {
    return <span className="text-xs text-slate-400 font-mono">-</span>;
  }

  const { status, total_events } = summary;

  let badgeClass = "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900";
  if (status === "High Activity") {
    badgeClass = "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 font-bold";
  } else if (status === "Attention") {
    badgeClass = "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 font-semibold";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Status: ${status} (${total_events} events). Click to inspect.`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors cursor-pointer select-none ${badgeClass}`}
    >
      <span>{status}</span>
      <span className="opacity-75 font-mono text-[11px]">({total_events})</span>
    </button>
  );
}
