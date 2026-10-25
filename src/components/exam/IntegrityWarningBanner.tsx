"use client";

import React from "react";
import { INTEGRITY_CONFIG } from "@/lib/exam-integrity/config";

interface IntegrityWarningBannerProps {
  isFullscreen: boolean;
  fullscreenExitCount: number;
  onEnterFullscreen: () => void;
  windowLeftWarning: boolean;
  onDismissWindowLeft: () => void;
  toastNotification: string | null;
  onDismissToast: () => void;
  hasSeenNotice: boolean;
}

export function IntegrityWarningBanner({
  isFullscreen,
  fullscreenExitCount,
  onEnterFullscreen,
  windowLeftWarning,
  onDismissWindowLeft,
  toastNotification,
  onDismissToast,
  hasSeenNotice,
}: IntegrityWarningBannerProps) {
  const isRepeatedFullscreenExit =
    fullscreenExitCount >= INTEGRITY_CONFIG.FULLSCREEN_WARNING_REPEAT_THRESHOLD;

  return (
    <>
      {/* 1. Window left warning (Concise return notice per specification) */}
      {windowLeftWarning && (
        <div className="bg-amber-950/90 border-b border-amber-600/40 text-amber-200 px-4 py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5 max-w-5xl">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium text-amber-100">
              Exam window was left. This activity has been recorded.
            </span>
          </div>
          <button
            onClick={onDismissWindowLeft}
            className="p-1 text-amber-400 hover:text-amber-200 hover:bg-amber-900/60 rounded transition-colors"
            title="Dismiss notice"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 2. Fullscreen exit warning (Only after notice dismissed and not currently fullscreen) */}
      {!isFullscreen && hasSeenNotice && (
        <div
          className={`border-b px-4 py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm transition-all ${
            isRepeatedFullscreenExit
              ? "bg-rose-950/90 border-rose-600/40 text-rose-200"
              : "bg-amber-950/80 border-amber-600/30 text-amber-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isRepeatedFullscreenExit ? (
              <svg className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div>
              {isRepeatedFullscreenExit ? (
                <span className="font-semibold text-rose-100">
                  ⚠️ Warning: Fullscreen has been exited multiple times ({fullscreenExitCount} exits recorded). Please return to fullscreen immediately. Repeated exits are flagged for invigilator review.
                </span>
              ) : (
                <span className="font-medium text-amber-100">
                  Exam is not in fullscreen mode ({fullscreenExitCount} exit{fullscreenExitCount === 1 ? "" : "s"} logged). Fullscreen is recommended for exam integrity.
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onEnterFullscreen}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold shadow-xs shrink-0 cursor-pointer transition-colors ${
              isRepeatedFullscreenExit
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>Enter Fullscreen</span>
          </button>
        </div>
      )}

      {/* 3. Non-blocking Toast Pill for blocked actions (Copy/paste, shortcut, context menu) */}
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-slate-900/95 text-slate-100 border border-slate-700/80 px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 text-xs max-w-sm">
            <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{toastNotification}</span>
            <button
              onClick={onDismissToast}
              className="ml-2 text-slate-400 hover:text-slate-200 p-0.5 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
