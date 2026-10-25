"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CombinedExamHeader } from "./CombinedExamHeader";
import { SubjectExamClient } from "./SubjectExamClient";
import { Exam, ExamResponses, ExamStatuses } from "@/lib/types/exam";
import { finalizeAttemptsAction, exitTestExamAction } from "@/app/(student)/attempt/[attemptId]/actions";
import { loadUnselectedSubjectPaperAction } from "./actions";
import { useRouter } from "next/navigation";
import { useExamIntegrity, exitBrowserFullscreen, isBrowserFullscreen } from "@/hooks/useExamIntegrity";
import { useExamSaveQueue } from "@/lib/exam/save-queue";
import type { ActionResult } from "@/lib/exam/constants";
import { FullscreenLockOverlay } from "@/components/exam/FullscreenLockOverlay";
import { IntegrityWarningBanner } from "@/components/exam/IntegrityWarningBanner";

export interface SubjectExam {
  attemptId: string;
  assessmentSubjectId?: string;
  subjectName: string;
  subjectCode: string;
  isAttemptable: boolean;
  exam?: Exam;
  initialResponses: ExamResponses;
  initialStatuses: ExamStatuses;
}

interface CombinedExamClientProps {
  assessmentId: string;
  assessmentTitle: string;
  subjectExams: SubjectExam[];
  expirationTimeMs: number;
  manualSubmitUnlockTimeMs: number;
  initialTimeLeft: number;
  isTest?: boolean;
}

export function CombinedExamClient({
  assessmentId,
  assessmentTitle,
  subjectExams,
  expirationTimeMs,
  manualSubmitUnlockTimeMs,
  initialTimeLeft,
  isTest = false,
}: CombinedExamClientProps) {
  const router = useRouter();
  const { queue: saveQueue, status: saveStatus, flush: flushSaveQueue } = useExamSaveQueue();

  const [exams, setExams] = useState<SubjectExam[]>(subjectExams);
  const [loadingAttemptId, setLoadingAttemptId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Default active subject to first selected/attemptable subject
  const [activeAttemptId, setActiveAttemptId] = useState(
    () => exams.find((s) => s.isAttemptable)?.attemptId || exams[0]?.attemptId
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const autoSubmitFiredRef = useRef(false);
  const activeCommitWrapperRef = useRef<(() => void) | null>(null);
  const hasCompletedExamRef = useRef(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [autoSubmitError, setAutoSubmitError] = useState<string | null>(null);
  const [isAdvisoryDismissed, setIsAdvisoryDismissed] = useState(false);
  
  const [canSubmit, setCanSubmit] = useState(() => isTest || Date.now() >= manualSubmitUnlockTimeMs);
  const [isExpired, setIsExpired] = useState(() => Date.now() >= expirationTimeMs);

  const handleRegisterActiveCommit = useCallback((commitFn: () => void) => {
    activeCommitWrapperRef.current = commitFn;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Safe cleanup: release fullscreen if exam has completed and unmounts
      if (hasCompletedExamRef.current && isBrowserFullscreen()) {
        exitBrowserFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (canSubmit) return;
    const remainingMs = Math.max(0, manualSubmitUnlockTimeMs - Date.now());
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setCanSubmit(true);
      }
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [canSubmit, manualSubmitUnlockTimeMs]);

  useEffect(() => {
    if (isExpired) return;
    const remainingMs = Math.max(0, expirationTimeMs - Date.now());
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setIsExpired(true);
      }
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [isExpired, expirationTimeMs]);

  // Determine current attemptable attempt for logging integrity events
  const primaryAttemptId =
    (exams.find((s) => s.attemptId === activeAttemptId && s.isAttemptable) ||
      exams.find((s) => s.isAttemptable))?.attemptId || null;

  const {
    isFullscreen,
    fullscreenState,
    fullscreenExitCount,
    requestFullscreen,
    windowLeftWarning,
    dismissWindowLeftWarning,
    notification,
    dismissNotification,
    hasCompletedInitialNotice,
    flushIntegrityEvents,
  } = useExamIntegrity({
    attemptId: primaryAttemptId,
    isEnabled: true,
  });

  const isResuming = useMemo(() => {
    return exams.some(
      (s) =>
        Object.keys(s.initialResponses || {}).length > 0 ||
        Object.values(s.initialStatuses || {}).some((st) => st.answered || st.visited)
    );
  }, [exams]);

  // On-demand fetch of unselected subject paper when student opens tab
  const handleSubjectChange = useCallback(
    async (newSubjectId: string) => {
      if (fullscreenState !== "active-fullscreen") return;

      // Commit active question draft of current subject before switching
      activeCommitWrapperRef.current?.();

      setActiveAttemptId(newSubjectId);
      setLoadError(null);

      const targetSubj = exams.find((s) => s.attemptId === newSubjectId);
      if (targetSubj && !targetSubj.exam && targetSubj.assessmentSubjectId) {
        setLoadingAttemptId(newSubjectId);
        try {
          const res = await loadUnselectedSubjectPaperAction(
            assessmentId,
            targetSubj.assessmentSubjectId
          );
          if (res.success && res.exam) {
            const loadedExam = res.exam;
            const initialStatuses: ExamStatuses = {};
            loadedExam.questions.forEach((q, idx) => {
              initialStatuses[q.id] = {
                visited: idx === 0,
                answered: false,
                markedForReview: false,
              };
            });

            setExams((prev) =>
              prev.map((s) =>
                s.attemptId === newSubjectId
                  ? {
                      ...s,
                      exam: loadedExam,
                      initialStatuses,
                    }
                  : s
              )
            );
          } else {
            setLoadError(res.message || "Failed to load subject paper.");
          }
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : "Error loading subject paper.");
        } finally {
          setLoadingAttemptId(null);
        }
      }
    },
    [exams, assessmentId, fullscreenState]
  );

  const handleSubmitAll = useCallback(async (isAuto = false) => {
    if (!isMountedRef.current) return;
    if (isSubmittingRef.current) return;
    if (!isAuto && fullscreenState !== "active-fullscreen") return;
    if (!isAuto && Date.now() < manualSubmitUnlockTimeMs) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setAutoSubmitError(null);

    try {
      // 1. Commit active question draft into save queue
      activeCommitWrapperRef.current?.();

      // 2. Flush pending saves with 10s timeout
      await flushSaveQueue(10000);
      if (!isMountedRef.current) return;

      // 3. Flush buffered integrity events (drain all batches)
      await flushIntegrityEvents(true);
      if (!isMountedRef.current) return;

      // 4. Atomically finalize all attemptable subjects in ONE RPC transaction
      const attemptableAttemptIds = exams
        .filter((s) => s.isAttemptable)
        .map((s) => s.attemptId);

      if (isAuto) {
        let autoSuccess = false;
        let lastErrorMsg = "Automatic submission failed";

        for (let attempt = 1; attempt <= 10; attempt++) {
          if (!isMountedRef.current) return;

          let res: ActionResult<{ finalized_count: number; skipped_count: number }>;
          try {
            res = await finalizeAttemptsAction(attemptableAttemptIds, saveQueue.getPendingResponses());
          } catch (err: unknown) {
            // A thrown error (network failure, server error) counts as a failed attempt and is retried
            res = {
              success: false,
              code: "TRANSIENT",
              message: err instanceof Error ? err.message : "Network error during submission",
            };
          }

          if (!isMountedRef.current) return;

          if (res.success) {
            autoSuccess = true;
            break;
          }

          lastErrorMsg = res.message || "Automatic submission failed";

          // If UNAUTHORIZED, stop retrying immediately and show banner
          if (res.code === "UNAUTHORIZED") {
            console.error("Auto-submit unauthorized, stopping retries:", res.message);
            break;
          }

          // Retry on INVALID (clock skew) and TRANSIENT only, up to 10 attempts, 3 seconds apart
          if (attempt < 10) {
            console.warn(`Auto-submit attempt ${attempt}/10 rejected (${res.code}: ${res.message}). Retrying in 3s...`);
            await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000));
            if (!isMountedRef.current) return;
          }
        }

        if (!isMountedRef.current) return;

        if (!autoSuccess) {
          console.error("Auto-submission failed after retries:", lastErrorMsg);
          setAutoSubmitError(lastErrorMsg);
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }

        // 5. Release fullscreen and redirect on success
        setAutoSubmitError(null);
        setShowSubmitModal(false);
        hasCompletedExamRef.current = true;
        await exitBrowserFullscreen();
        router.push(isTest ? `/student/assessment/${assessmentId}` : `/student/assessment/${assessmentId}?submitted=true`);
      } else {
        // Manual submit path
        let res: ActionResult<{ finalized_count: number; skipped_count: number }>;
        try {
          res = await finalizeAttemptsAction(attemptableAttemptIds, saveQueue.getPendingResponses());
        } catch (err: unknown) {
          res = {
            success: false,
            code: "TRANSIENT",
            message: err instanceof Error ? err.message : "Failed to finalize attempts",
          };
        }

        if (!isMountedRef.current) return;

        if (!res.success) {
          alert(`Submission failed: ${res.message}`);
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }

        // 5. Release fullscreen and redirect on success
        setAutoSubmitError(null);
        setShowSubmitModal(false);
        hasCompletedExamRef.current = true;
        await exitBrowserFullscreen();
        router.push(isTest ? `/student/assessment/${assessmentId}` : `/student/assessment/${assessmentId}?submitted=true`);
      }
    } catch (err) {
      console.error("Submit failed", err);
      if (!isMountedRef.current) return;

      if (!isAuto) {
        alert(err instanceof Error ? err.message : "Failed to submit exam. Please try again.");
      } else {
        setAutoSubmitError(err instanceof Error ? err.message : "Automatic submission failed");
      }
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [manualSubmitUnlockTimeMs, flushSaveQueue, flushIntegrityEvents, exams, router, isTest, assessmentId, fullscreenState, saveQueue]);

  // Auto-submit at expiration
  useEffect(() => {
    if (autoSubmitFiredRef.current) return;
    const timeUntilExpire = Math.max(0, expirationTimeMs - Date.now());
    const timer = setTimeout(() => {
      if (!autoSubmitFiredRef.current && !isSubmittingRef.current) {
        autoSubmitFiredRef.current = true;
        handleSubmitAll(true);
      }
    }, timeUntilExpire + Math.random() * 3000);
    return () => clearTimeout(timer);
  }, [expirationTimeMs, handleSubmitAll]);

  const candidateName = exams.find((s) => s.exam)?.exam?.candidateName || "";
  const candidateId = exams.find((s) => s.exam)?.exam?.candidateId || "";

  const handleNextSubject = useCallback((currentSubjectId: string) => {
    if (fullscreenState !== "active-fullscreen") return;
    const currentIndex = exams.findIndex((s) => s.attemptId === currentSubjectId);
    if (currentIndex >= 0 && currentIndex < exams.length - 1) {
      handleSubjectChange(exams[currentIndex + 1].attemptId);
    }
  }, [exams, handleSubjectChange, fullscreenState]);

  const handleExitTestExam = useCallback(async () => {
    if (fullscreenState !== "active-fullscreen") return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // 1. Commit active question draft into save queue before flush
      activeCommitWrapperRef.current?.();

      // 2. Flush pending saves with 10s timeout
      let allSaved = true;
      if (flushSaveQueue) {
        allSaved = await flushSaveQueue(10000);
      }
      if (!isMountedRef.current) return;

      if (!allSaved) {
        const proceed = window.confirm(
          "Some of your answers could not be saved to the server due to network issues. If you exit now, unsaved answers will be lost and not evaluated.\n\nClick Cancel to retry saving, or click OK to exit anyway."
        );
        if (!proceed) {
          isSubmittingRef.current = false;
          if (isMountedRef.current) {
            setIsSubmitting(false);
            setShowExitModal(false);
          }
          return;
        }
      }

      await flushIntegrityEvents(true);
      if (!isMountedRef.current) return;

      const attemptableAttemptIds = exams
        .filter((s) => s.isAttemptable)
        .map((s) => s.attemptId);

      const res = await exitTestExamAction(assessmentId, attemptableAttemptIds);
      if (!isMountedRef.current) return;

      if (!res.success) {
        alert(`Failed to exit test exam: ${res.message}`);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      setShowExitModal(false);
      hasCompletedExamRef.current = true;
      await exitBrowserFullscreen();
      router.push(`/student/assessment/${assessmentId}`);
    } catch (err) {
      console.error("Exit test exam failed:", err);
      if (isMountedRef.current) {
        alert(err instanceof Error ? err.message : "Failed to exit test exam");
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  }, [assessmentId, exams, flushSaveQueue, flushIntegrityEvents, router, fullscreenState]);

  return (
    <div className="theme-exam min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      {isTest && (
        <div className="bg-purple-700 text-white px-6 py-1.5 flex items-center justify-between text-xs font-medium tracking-wide z-20 shrink-0 shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold bg-purple-900 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">TEST ASSIGNMENT</span>
            <span>Early submit and exit are enabled. Progress is fully evaluated.</span>
          </div>
          <button
            onClick={() => {
              if (fullscreenState === "active-fullscreen") {
                setShowExitModal(true);
              }
            }}
            disabled={fullscreenState !== "active-fullscreen"}
            className="text-purple-200 hover:text-white underline font-semibold cursor-pointer disabled:opacity-50 disabled:no-underline"
          >
            Exit &amp; Finish Test →
          </button>
        </div>
      )}
      {autoSubmitError && (
        <div className="bg-amber-600 text-white px-6 py-2.5 flex items-center justify-between shadow-md z-50 shrink-0">
          <div className="flex items-center space-x-2 text-sm font-medium">
            <span>Automatic submission was delayed ({autoSubmitError}). Please click Submit now to finish your exam.</span>
          </div>
          <button
            onClick={() => handleSubmitAll(false)}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 font-bold text-xs uppercase tracking-wider rounded-md hover:bg-amber-50 dark:hover:bg-amber-900 transition-colors shadow-xs"
          >
            {isSubmitting ? "Submitting..." : "Submit now"}
          </button>
        </div>
      )}
      <CombinedExamHeader 
        assessmentTitle={assessmentTitle}
        candidateName={candidateName}
        candidateId={candidateId}
        expirationTimeMs={expirationTimeMs}
        initialTimeLeft={initialTimeLeft}
        subjects={exams.map((s) => ({
          id: s.attemptId,
          name: s.subjectName,
          isAttemptable: s.isAttemptable,
        }))}
        activeSubjectId={activeAttemptId}
        onSubjectChange={fullscreenState === "active-fullscreen" ? handleSubjectChange : () => {}}
        onExit={isTest ? () => {
          if (fullscreenState === "active-fullscreen") {
            setShowExitModal(true);
          }
        } : async () => {
          if (fullscreenState === "active-fullscreen") {
            hasCompletedExamRef.current = true;
            await exitBrowserFullscreen();
            router.push("/student");
          }
        }}
        saveStatus={saveStatus}
      />

      {/* Laptop-First Advisory for Narrow Screens (< 1024px / lg) */}
      {!isAdvisoryDismissed && (
        <div className="lg:hidden bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between text-amber-900 dark:text-amber-200 shrink-0 z-20 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 font-bold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-950 dark:text-amber-100 text-[10px] uppercase tracking-wide">
              Laptop Advisory
            </span>
            <p className="text-xs truncate sm:text-clip">
              Live mock examinations are optimized for laptops (1024px+). For the best classroom testing experience, please switch to a laptop.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAdvisoryDismissed(true)}
            className="text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 text-xs font-semibold px-2 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900 shrink-0 ml-2 cursor-pointer"
            aria-label="Dismiss laptop advisory notice"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Fullscreen Gate & Lockout Overlay */}
      {fullscreenState !== "active-fullscreen" && (
        <FullscreenLockOverlay
          state={fullscreenState}
          isResuming={isResuming}
          fullscreenExitCount={fullscreenExitCount}
          onEnterFullscreen={requestFullscreen}
          saveStatus={saveStatus}
        />
      )}

      {/* Dynamic Warnings: window left, fullscreen exited, or restricted action notice */}
      <IntegrityWarningBanner
        isFullscreen={isFullscreen}
        fullscreenExitCount={fullscreenExitCount}
        onEnterFullscreen={requestFullscreen}
        windowLeftWarning={windowLeftWarning}
        onDismissWindowLeft={dismissWindowLeftWarning}
        toastNotification={notification}
        onDismissToast={dismissNotification}
        hasSeenNotice={hasCompletedInitialNotice}
      />
      
      {/* Render all subject exams inside guarded workspace */}
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-150 ${
          fullscreenState !== "active-fullscreen" ? "pointer-events-none select-none filter blur-xs" : ""
        }`}
        inert={fullscreenState !== "active-fullscreen"}
        aria-hidden={fullscreenState !== "active-fullscreen"}
      >
        {exams.map((subj, idx) => {
          if (!subj.exam) {
            if (subj.attemptId === activeAttemptId) {
              return (
                <div
                  key={subj.attemptId}
                  className="flex-1 flex flex-col items-center justify-center p-12 text-center"
                >
                  {loadingAttemptId === subj.attemptId ? (
                    <>
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                      <h3 className="text-lg font-semibold text-foreground">
                        Loading {subj.subjectName} Paper
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Preparing questions and secure assets...
                      </p>
                    </>
                  ) : loadError ? (
                    <div className="max-w-md p-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
                      <h4 className="font-bold mb-1">Failed to load paper</h4>
                      <p className="text-sm mb-4">{loadError}</p>
                      <button
                        onClick={() => handleSubjectChange(subj.attemptId)}
                        className="px-4 py-2 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 cursor-pointer"
                      >
                        Retry Loading
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }
            return null;
          }

          return (
            <SubjectExamClient
              key={subj.attemptId}
              subjectExam={subj as SubjectExam & { exam: Exam }}
              isActive={subj.attemptId === activeAttemptId}
              onSubmitRequest={() => {
                if (fullscreenState === "active-fullscreen") {
                  setShowSubmitModal(true);
                }
              }}
              canSubmit={canSubmit}
              onNextSubject={idx < exams.length - 1 ? () => handleNextSubject(subj.attemptId) : undefined}
              isVeryLastSubject={idx === exams.length - 1}
              saveQueue={saveQueue}
              saveStatus={saveStatus}
              onRegisterActiveCommit={handleRegisterActiveCommit}
              isExpired={isExpired}
            />
          );
        })}
      </div>

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-card text-card-foreground p-8 rounded-lg max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Submit Exam?</h2>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to submit the exam? This will finalize your answers for 
              <strong> all {exams.filter((s) => s.isAttemptable).length} selected subjects</strong>. 
              Non-selected subjects will not be evaluated. You will not be able to change your answers.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSubmitAll(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-card text-card-foreground p-8 rounded-lg max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-purple-700 dark:text-purple-300">Exit &amp; Finish Test?</h2>
            <p className="text-muted-foreground mb-6">
              This will immediately submit and evaluate your test answers for 
              <strong> all {exams.filter((s) => s.isAttemptable).length} selected subjects</strong>. 
              You will be able to review your test results and retake this test at any time.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowExitModal(false)}
                className="px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={handleExitTestExam}
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition-colors cursor-pointer"
              >
                {isSubmitting ? "Finishing..." : "Yes, Exit & Finish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
