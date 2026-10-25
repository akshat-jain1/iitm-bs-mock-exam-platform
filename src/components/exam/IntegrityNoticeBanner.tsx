"use client";

import React, { useState } from "react";

interface IntegrityNoticeBannerProps {
  onAcknowledgeAndFullscreen: () => Promise<boolean> | void;
}

export function IntegrityNoticeBanner({
  onAcknowledgeAndFullscreen,
}: IntegrityNoticeBannerProps) {
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    try {
      await onAcknowledgeAndFullscreen();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-slate-900/95 border-b border-indigo-500/30 text-slate-100 px-4 py-3 shadow-md transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
            {/* Warning Shield Icon */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              <span>Exam Integrity &amp; Invigilation Notice</span>
              <span className="text-[10px] uppercase tracking-wider bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                Active
              </span>
            </div>
            <div className="text-slate-300 mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>• Fullscreen is required/recommended throughout the test</span>
              <span>• Tab switches &amp; window exits are recorded</span>
              <span>• Copy, paste &amp; context menu are disabled</span>
              <span>• Activity logs are reviewed by exam invigilators</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <button
            onClick={handleClick}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-md text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-75 disabled:cursor-wait"
          >
            <svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <svg className="w-3.5 h-3.5 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>I Understand &amp; Enter Fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
