"use client";

import React from "react";
import { QuestionPalette } from "@/components/exam/QuestionPalette";
import { ExamActionBar } from "@/components/exam/ExamActionBar";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { useExamSession } from "@/hooks/useExamSession";
import { Exam, ResponseValue } from "@/lib/types/exam";
import { ExamSaveQueue, SaveStatus } from "@/lib/exam/save-queue";
import { SubjectExam } from "./CombinedExamClient";

interface SubjectExamClientProps {
  subjectExam: SubjectExam & { exam: Exam };
  isActive: boolean;
  onSubmitRequest: () => void;
  canSubmit: boolean;
  onNextSubject?: () => void;
  isVeryLastSubject?: boolean;
  saveQueue: ExamSaveQueue;
  saveStatus: SaveStatus;
  onRegisterActiveCommit?: (commitFn: () => void) => void;
  isExpired?: boolean;
}

function getDesignatedReferenceQuestionIndex(
  questions: Exam["questions"],
  sectionId?: string
): number | null {
  const targetQuestions = sectionId
    ? questions.filter((q) => q.sectionId === sectionId)
    : questions;

  if (!targetQuestions || targetQuestions.length === 0) return null;

  // Case 1: First question starts at Q2 -> reference material was authored as Q1 (index 0)
  const firstSource = targetQuestions[0]?.sourceQuestionNumber;
  if (firstSource === 2) {
    const foundIdx = questions.indexOf(targetQuestions[0]);
    return foundIdx !== -1 ? foundIdx : 0;
  }

  // Case 2: Gap detected in sourceQuestionNumber (e.g., Q1 then Q3 -> Q2 is reference data)
  for (let i = 0; i < targetQuestions.length - 1; i++) {
    const cur = targetQuestions[i].sourceQuestionNumber;
    const next = targetQuestions[i + 1].sourceQuestionNumber;
    if (cur !== undefined && next !== undefined && next === cur + 2) {
      const foundIdx = questions.indexOf(targetQuestions[i + 1]);
      return foundIdx !== -1 ? foundIdx : i + 1;
    }
  }

  return null;
}

export const SubjectExamClient = React.memo(function SubjectExamClient({
  subjectExam,
  isActive,
  onSubmitRequest,
  canSubmit,
  onNextSubject,
  isVeryLastSubject,
  saveQueue,
  saveStatus,
  onRegisterActiveCommit,
  isExpired = false,
}: SubjectExamClientProps) {
  const { exam, attemptId, initialResponses, initialStatuses, isAttemptable } = subjectExam;
  
  const handleSaveResponse = (questionId: string, value: ResponseValue | null, markedForReview: boolean) => {
    // Hard guard: never send save responses for non-selected subjects
    if (!isAttemptable) return;

    try {
      const q = exam.questions.find(q => q.id === questionId);
      let payload = null;
      
      if (value !== null && value !== undefined && value !== "") {
        if (q?.type === "MCQ") {
          payload = { selected_option_id: value };
        } else if (q?.type === "MSQ") {
          payload = { selected_option_ids: value };
        } else if (q?.type === "NUMERICAL") {
          const parsed = typeof value === "number" ? value : parseFloat(value as string);
          payload = { value: Number.isFinite(parsed) ? parsed : value };
        }
      }

      // Enqueue in non-blocking background queue with coalescing & retry backoff
      saveQueue.enqueue(attemptId, questionId, payload, markedForReview);
    } catch (err) {
      console.error("Failed to construct autosave payload", err);
    }
  };

  const {
    currentQuestionIndex,
    currentQuestion,
    statuses,
    draftResponses,
    committedResponses,
    navigateTo,
    handleNext,
    handlePrev,
    setResponse,
    clearResponse,
    commitResponse,
    isFirst,
    isLast
  } = useExamSession(exam, {
    initialResponses,
    initialStatuses,
    onSaveResponse: handleSaveResponse
  });

  const [mobilePaletteOpen, setMobilePaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobilePaletteOpen) {
        setMobilePaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobilePaletteOpen]);

  React.useEffect(() => {
    if (isActive && onRegisterActiveCommit && isAttemptable) {
      onRegisterActiveCommit(commitResponse);
    }
  }, [isActive, commitResponse, onRegisterActiveCommit, isAttemptable]);

  // Preload images for the next 1–2 questions in background
  React.useEffect(() => {
    if (!isActive || !exam.questions || exam.questions.length === 0) return;

    const nextQuestions = [
      exam.questions[currentQuestionIndex + 1],
      exam.questions[currentQuestionIndex + 2],
    ].filter(Boolean);

    const urlsToPreload: string[] = [];
    for (const q of nextQuestions) {
      if (q.imageUrl) urlsToPreload.push(q.imageUrl);
      if (q.imageUrls) urlsToPreload.push(...q.imageUrls);
      if (q.groupId) {
        const grp = exam.groups.find((g) => g.id === q.groupId);
        if (grp?.imageUrl) urlsToPreload.push(grp.imageUrl);
        if (grp?.imageUrls) urlsToPreload.push(...grp.imageUrls);
      }
      if (q.options) {
        for (const opt of q.options) {
          if (opt.imageUrl) urlsToPreload.push(opt.imageUrl);
          if (opt.imageUrls) urlsToPreload.push(...opt.imageUrls);
        }
      }
    }

    const uniqueUrls = Array.from(new Set(urlsToPreload.filter(Boolean)));
    for (const url of uniqueUrls) {
      const img = new Image();
      img.src = url;
    }
  }, [isActive, currentQuestionIndex, exam.questions, exam.groups]);

  const currentGroup = currentQuestion?.groupId 
    ? exam.groups.find(g => g.id === currentQuestion.groupId) 
    : undefined;

  const currentSection = currentQuestion?.sectionId
    ? exam.sections?.find(s => s.id === currentQuestion.sectionId)
    : undefined;

  // Determine designated reference location to avoid repeating on every question
  const designatedExamRefIndex = React.useMemo(() => {
    if (!exam.referenceMaterial) return null;
    return getDesignatedReferenceQuestionIndex(exam.questions);
  }, [exam.referenceMaterial, exam.questions]);

  const designatedSectionRefIndex = React.useMemo(() => {
    if (!currentSection?.referenceMaterial) return null;
    return getDesignatedReferenceQuestionIndex(exam.questions, currentSection.id);
  }, [currentSection, exam.questions]);

  const effectiveExamRefIndex = designatedExamRefIndex !== null 
    ? designatedExamRefIndex 
    : (exam.referenceMaterial ? 0 : null);

  const effectiveSectionRefIndex = designatedSectionRefIndex !== null
    ? designatedSectionRefIndex
    : null;

  const isCurrentDesignatedRef = 
    (effectiveExamRefIndex !== null && currentQuestionIndex === effectiveExamRefIndex) ||
    (effectiveSectionRefIndex !== null && currentQuestionIndex === effectiveSectionRefIndex);

  const activeReferenceData = isCurrentDesignatedRef
    ? (effectiveExamRefIndex !== null && currentQuestionIndex === effectiveExamRefIndex
        ? exam.referenceMaterial
        : currentSection?.referenceMaterial)
    : undefined;

  const currentStatus = currentQuestion ? statuses[currentQuestion.id] : undefined;
  const currentDraft = currentQuestion ? draftResponses[currentQuestion.id] : undefined;
  const currentCommitted = currentQuestion ? committedResponses[currentQuestion.id] : undefined;
  const currentResponse = currentDraft !== undefined ? currentDraft : (currentCommitted !== undefined ? currentCommitted : null);

  if (!currentQuestion) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-12 text-slate-500 dark:text-slate-400 ${isActive ? "" : "hidden"}`}>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">No questions available for this subject.</p>
        <p className="text-sm mt-1 text-slate-500 dark:text-slate-400">Please select another subject or contact the examination administrator.</p>
      </div>
    );
  }

  const handleNextWrapper = () => {
    if (isLast) {
      if (isAttemptable) {
        commitResponse();
      }
      if (onNextSubject) {
        onNextSubject();
      }
    } else {
      handleNext();
    }
  };

  const handlePrevWrapper = () => {
    handlePrev();
  };

  const handleNavigateWrapper = (index: number) => {
    navigateTo(index);
  };

  const handleToggleReviewWrapper = () => {
    if (!isAttemptable) return;
    const isCurrentlyMarked = !!currentStatus?.markedForReview;
    commitResponse(!isCurrentlyMarked);
    if (isLast) {
      if (onNextSubject) {
        onNextSubject();
      }
    } else {
      handleNext();
    }
  };

  const isActuallyLast = isLast && !!isVeryLastSubject;

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isActive ? "" : "hidden"}`}>
      {/* Banner for Non-Selected Subjects */}
      {!isAttemptable && (
        <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-6 py-2.5 flex items-center justify-between text-amber-900 dark:text-amber-200 shrink-0 z-10 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <span className="font-bold px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-950 dark:text-amber-100 text-[11px] uppercase tracking-wide">
              Not Selected
            </span>
            <span className="text-xs sm:text-sm font-medium">
              This subject was not selected for this exam attempt. Questions are displayed in read-only mode for paper review. Answer controls are disabled.
            </span>
          </div>
        </div>
      )}

      {/* Banner for Failed Save on Current Question */}
      {saveStatus.failedQuestionIds.has(currentQuestion.id) && (
        <div className="bg-rose-50 dark:bg-rose-950 border-b border-rose-200 dark:border-rose-800 px-6 py-2.5 flex items-center justify-between text-rose-900 dark:text-rose-200 shrink-0 z-10 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <span className="font-bold px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-800 text-rose-950 dark:text-rose-100 text-[11px] uppercase tracking-wide">
              Save Failed
            </span>
            <span className="text-xs sm:text-sm font-medium">
              Could not save your answer ({saveStatus.message || "Failed"}). Your answer remains visible locally.
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          {/* Mobile Palette Bar Trigger (< lg) */}
          <div className="lg:hidden flex items-center justify-between px-4 py-2 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Question {currentQuestionIndex + 1} of {exam.questions.length}
            </span>
            <button
              type="button"
              onClick={() => setMobilePaletteOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              aria-label="Open question palette"
            >
              <span>Question Palette</span>
              <span className="font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold text-[10px]">
                {currentQuestionIndex + 1}/{exam.questions.length}
              </span>
            </button>
          </div>

          <QuestionRenderer 
            index={currentQuestionIndex}
            question={currentQuestion}
            group={currentGroup}
            referenceMaterial={activeReferenceData}
            designatedRefIndex={effectiveExamRefIndex}
            onNavigateToRef={handleNavigateWrapper}
            response={currentResponse}
            onResponseChange={(val) => {
              if (!isAttemptable || isExpired) return;
              setResponse(val);
            }}
            disabled={!isAttemptable || isExpired}
            isActive={isActive}
          />
        </div>

        {/* Desktop Palette (>= lg) */}
        <QuestionPalette 
          exam={exam} 
          statuses={statuses} 
          currentIndex={currentQuestionIndex}
          onNavigate={handleNavigateWrapper}
          failedQuestionIds={saveStatus.failedQuestionIds}
          refQuestionIndex={effectiveExamRefIndex}
          className="hidden lg:flex"
        />

        {/* Mobile Palette Drawer (< lg) */}
        {mobilePaletteOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobilePaletteOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 max-w-xs w-full bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              <QuestionPalette
                exam={exam}
                statuses={statuses}
                currentIndex={currentQuestionIndex}
                onNavigate={(idx) => {
                  handleNavigateWrapper(idx);
                  setMobilePaletteOpen(false);
                }}
                failedQuestionIds={saveStatus.failedQuestionIds}
                refQuestionIndex={effectiveExamRefIndex}
                onClose={() => setMobilePaletteOpen(false)}
                className="w-full h-full border-l-0"
              />
            </div>
          </div>
        )}
      </main>

      <ExamActionBar 
        onPrevious={handlePrevWrapper}
        onNext={handleNextWrapper}
        onClearResponse={() => {
          if (!isAttemptable || isExpired) return;
          clearResponse();
        }}
        onToggleReview={isExpired ? () => {} : handleToggleReviewWrapper}
        onSubmit={onSubmitRequest}
        isFirst={isFirst}
        isLast={isActuallyLast}
        status={currentStatus || { visited: false, answered: false, markedForReview: false }}
        submitDisabled={!canSubmit}
        isAttemptable={isAttemptable}
      />
    </div>
  );
});
