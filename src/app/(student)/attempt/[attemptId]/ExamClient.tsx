"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ExamHeader } from "@/components/exam/ExamHeader";
import { QuestionPalette } from "@/components/exam/QuestionPalette";
import { ExamActionBar } from "@/components/exam/ExamActionBar";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { useExamSession } from "@/hooks/useExamSession";
import { Exam, ExamResponses, ExamStatuses, ResponseValue } from "@/lib/types/exam";
import { saveResponseAction, submitAttemptAction } from "./actions";
import { useRouter } from "next/navigation";

interface RealExamClientProps {
  attemptId: string;
  exam: Exam;
  initialResponses: ExamResponses;
  initialStatuses: ExamStatuses;
  expirationTimeMs: number;
}

export function RealExamClient({ attemptId, exam, initialResponses, initialStatuses, expirationTimeMs }: RealExamClientProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  
  // Create a debounced save queue to avoid spamming the server
  // For simplicity, we just use the action directly since the hook is called per-question change
  // and we don't change questions 10 times a second.
  const handleSaveResponse = async (questionId: string, value: ResponseValue | null, markedForReview: boolean) => {
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
      
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          await saveResponseAction(attemptId, questionId, payload, markedForReview);
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 150 + Math.random() * 150));
          }
        }
      }
      console.error("Failed to autosave response after retries:", lastError);
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

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitAttemptAction(attemptId);
      setShowSubmitModal(false);
      // Redirect to dashboard or results
      router.push("/student");
    } catch (err) {
      console.error("Submit failed", err);
      setIsSubmitting(false);
      alert("Failed to submit exam. Please try again.");
    }
  }, [attemptId, router]);

  // Timer enforcement (Client-side display, server handles real enforcement)
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() >= expirationTimeMs) {
        // Auto-submit when time expires
        clearInterval(interval);
        handleSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expirationTimeMs, handleSubmit]);

  // Determine designated reference location to avoid repeating on every question
  const designatedExamRefIndex = React.useMemo(() => {
    if (!exam.referenceMaterial) return null;
    const firstSource = exam.questions[0]?.sourceQuestionNumber;
    if (firstSource === 2) return 0;
    for (let i = 0; i < exam.questions.length - 1; i++) {
      const cur = exam.questions[i].sourceQuestionNumber;
      const next = exam.questions[i + 1].sourceQuestionNumber;
      if (cur !== undefined && next !== undefined && next === cur + 2) {
        return i + 1;
      }
    }
    return null;
  }, [exam.referenceMaterial, exam.questions]);

  const effectiveExamRefIndex = designatedExamRefIndex !== null 
    ? designatedExamRefIndex 
    : (exam.referenceMaterial ? 0 : null);

  if (!currentQuestion) return null;

  const currentGroup = currentQuestion.groupId 
    ? exam.groups.find(g => g.id === currentQuestion.groupId) 
    : undefined;

  const isCurrentDesignatedRef = 
    effectiveExamRefIndex !== null && currentQuestionIndex === effectiveExamRefIndex;

  const activeReferenceData = isCurrentDesignatedRef
    ? exam.referenceMaterial
    : undefined;

  const currentStatus = statuses[currentQuestion.id];
  const currentDraft = draftResponses[currentQuestion.id];
  const currentCommitted = committedResponses[currentQuestion.id];
  const currentResponse = currentDraft !== undefined ? currentDraft : (currentCommitted !== undefined ? currentCommitted : null);

  const handleNextWrapper = async () => {
    await commitResponse();
    if (!isLast) handleNext();
  };

  const handleToggleReviewWrapper = async () => {
    const isCurrentlyMarked = !!currentStatus?.markedForReview;
    await commitResponse(!isCurrentlyMarked);
    if (!isLast) handleNext();
  };

  return (
    <div className="theme-exam min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      <ExamHeader exam={exam} />
      
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <QuestionRenderer 
            index={currentQuestionIndex}
            question={currentQuestion}
            group={currentGroup}
            referenceMaterial={activeReferenceData}
            designatedRefIndex={effectiveExamRefIndex}
            onNavigateToRef={navigateTo}
            response={currentResponse}
            onResponseChange={setResponse}
          />
        </div>

        <QuestionPalette 
          exam={exam} 
          statuses={statuses} 
          currentIndex={currentQuestionIndex}
          onNavigate={navigateTo}
          refQuestionIndex={effectiveExamRefIndex}
        />
      </main>

      <ExamActionBar 
        onPrevious={handlePrev}
        onNext={handleNextWrapper}
        onClearResponse={clearResponse}
        onToggleReview={handleToggleReviewWrapper}
        onSubmit={() => setShowSubmitModal(true)}
        isFirst={isFirst}
        isLast={isLast}
        status={currentStatus}
      />

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-card text-card-foreground p-8 rounded-lg max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Submit Exam?</h2>
            <p className="text-muted-foreground mb-6">Are you sure you want to submit the exam? You will not be able to change your answers.</p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
