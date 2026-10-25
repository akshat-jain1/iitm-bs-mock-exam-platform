"use client";

import React, { useState } from "react";
import { ExamFullscreenState } from "@/hooks/useExamIntegrity";
import { SaveStatus } from "@/lib/exam/save-queue";

interface FullscreenLockOverlayProps {
  state: ExamFullscreenState;
  isResuming?: boolean;
  fullscreenExitCount: number;
  onEnterFullscreen: () => Promise<boolean>;
  saveStatus?: SaveStatus;
}

export function FullscreenLockOverlay({
  state,
  isResuming = false,
  fullscreenExitCount,
  onEnterFullscreen,
  saveStatus,
}: FullscreenLockOverlayProps) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAction = async () => {
    if (isPending) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      const entered = await onEnterFullscreen();
      if (!entered) {
        setErrorMessage(
          "Fullscreen mode was blocked or denied by your browser. Please allow fullscreen permission and click below to try again."
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to enter fullscreen mode. Please check browser permissions and try again."
      );
    } finally {
      setIsPending(false);
    }
  };

  const isLost = state === "fullscreen-lost";
  const title = isLost
    ? "Fullscreen Exited — Exam Locked"
    : isResuming
    ? "Resume Exam in Fullscreen"
    : "Fullscreen Required to Begin Exam";

  const description = isLost
    ? "Fullscreen was exited. Your exam is locked until you return to fullscreen. Your exam timer continues running."
    : isResuming
    ? "Your exam session is active and your timer continues running. Return to fullscreen mode to continue interacting with questions."
    : "To ensure exam integrity, this assessment must be taken in fullscreen mode. All questions, options, and navigation will unlock once fullscreen is confirmed.";

  const buttonText = isPending
    ? "Activating Fullscreen..."
    : isLost
    ? "Return to Fullscreen"
    : isResuming
    ? "Resume in Fullscreen"
    : "Enter Fullscreen & Begin";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fullscreen-lock-title"
      aria-describedby="fullscreen-lock-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
    >
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 sm:p-8 text-center text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Status Icon */}
        <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-5 shrink-0 transition-colors">
          {isLost ? (
            <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center ring-8 ring-rose-500/10">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center ring-8 ring-indigo-500/10">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 id="fullscreen-lock-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          {title}
        </h2>

        {/* Primary Description */}
        <p id="fullscreen-lock-desc" className="text-sm text-slate-300 mb-6 leading-relaxed">
          {description}
        </p>

        {/* Exit Count / Invigilation Warning */}
        {isLost && (
          <div className="mb-6 p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-xs text-rose-300 text-left space-y-1">
            <div className="font-semibold flex items-center justify-between">
              <span>Fullscreen exits recorded:</span>
              <span className="font-mono bg-rose-900/60 px-2 py-0.5 rounded text-rose-200">
                {fullscreenExitCount}
              </span>
            </div>
            {fullscreenExitCount >= 3 && (
              <p className="text-[11px] text-rose-400/90 pt-1 border-t border-rose-800/40">
                Notice: Repeated exits are flagged in your integrity log for invigilator review.
              </p>
            )}
          </div>
        )}

        {/* Integrity Rule Checklist for Awaiting Fullscreen */}
        {!isLost && (
          <div className="mb-6 p-3.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 text-left space-y-2">
            <div className="font-semibold text-slate-200">Exam Integrity Guidelines:</div>
            <ul className="space-y-1.5 text-slate-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <span>Fullscreen is required throughout the test</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <span>Tab switches &amp; window exits are recorded</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <span>Exam timer continues running server-authoritatively</span>
              </li>
            </ul>
          </div>
        )}

        {/* Autosave Status Reassurance */}
        {saveStatus && (
          <div className="mb-6 flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-800/40 py-2 px-3 rounded-md border border-slate-800">
            {saveStatus.state === "saved" || saveStatus.state === "idle" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Autosave: All answers saved to server</span>
              </>
            ) : saveStatus.state === "saving" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <span>Autosave: Syncing responses...</span>
              </>
            ) : saveStatus.state === "retrying" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Autosave: Retrying connection...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>Autosave: Save error ({saveStatus.failedQuestionIds.size} pending retry)</span>
              </>
            )}
          </div>
        )}

        {/* Error Feedback */}
        {errorMessage && (
          <div className="mb-6 p-3 bg-red-950/60 border border-red-700/60 rounded-lg text-xs text-red-200 flex items-start gap-2 text-left">
            <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          type="button"
          autoFocus
          onClick={handleAction}
          disabled={isPending}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
            isLost
              ? "bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-900/30"
              : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-900/30"
          } disabled:opacity-75 disabled:cursor-wait`}
        >
          {isPending && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          <span>{buttonText}</span>
        </button>
      </div>
    </div>
  );
}
