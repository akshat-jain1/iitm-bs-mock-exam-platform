"use client";
import React, { useState } from "react";
import { ExamHeader } from "@/components/exam/ExamHeader";
import { QuestionPalette } from "@/components/exam/QuestionPalette";
import { ExamActionBar } from "@/components/exam/ExamActionBar";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { ReferenceData } from "@/components/exam/ReferenceData";
import { useExamSession } from "@/hooks/useExamSession";
import { mockExam } from "@/lib/mock-data/exam";

export default function StudentExamPage() {
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
  } = useExamSession(mockExam);

  const [showSubmitModal, setShowSubmitModal] = useState(false);

  if (!currentQuestion) return null;

  const currentGroup = currentQuestion.groupId 
    ? mockExam.groups.find(g => g.id === currentQuestion.groupId) 
    : undefined;

  const currentSection = currentQuestion.sectionId
    ? mockExam.sections?.find(s => s.id === currentQuestion.sectionId)
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

  const handleSubmit = () => {
    alert("Exam submitted successfully! (Mock behavior)");
    setShowSubmitModal(false);
  };

  return (
    <div className="theme-exam min-h-screen bg-background text-foreground flex flex-col font-sans overflow-hidden">
      <ExamHeader exam={mockExam} />
      
      <main className="flex-1 flex overflow-hidden">
        {/* Main Question Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {(mockExam.referenceMaterial || currentSection?.referenceMaterial) && (
            <div className="px-8 pt-6 pb-2 shrink-0 space-y-3 bg-white/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 z-10 shadow-sm">
              {mockExam.referenceMaterial && (
                <ReferenceData data={mockExam.referenceMaterial} />
              )}
              {currentSection?.referenceMaterial && (
                <ReferenceData data={currentSection.referenceMaterial} />
              )}
            </div>
          )}

          <QuestionRenderer 
            index={currentQuestionIndex}
            question={currentQuestion}
            group={currentGroup}
            response={currentResponse}
            onResponseChange={setResponse}
          />
        </div>

        {/* Right Sidebar Palette */}
        <QuestionPalette 
          exam={mockExam} 
          statuses={statuses} 
          currentIndex={currentQuestionIndex}
          onNavigate={navigateTo}
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

      {/* Basic Submit Modal Simulation */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-card text-card-foreground p-8 rounded-lg max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Submit Exam?</h2>
            <p className="text-muted-foreground mb-6">Are you sure you want to submit the exam? You will not be able to change your answers.</p>
            <div className="flex justify-end space-x-3">
              <button 
                className="px-4 py-2 rounded-md hover:bg-secondary transition-colors"
                onClick={() => setShowSubmitModal(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={handleSubmit}
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
