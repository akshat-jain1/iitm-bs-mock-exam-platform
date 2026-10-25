import React from "react";
import { Exam, ExamStatuses } from "@/lib/types/exam";

interface QuestionPaletteProps {
  exam: Exam;
  statuses: ExamStatuses;
  currentIndex: number;
  onNavigate: (index: number) => void;
  failedQuestionIds?: Set<string>;
  refQuestionIndex?: number | null;
  onClose?: () => void;
  className?: string;
}

export function QuestionPalette({ 
  exam, 
  statuses, 
  currentIndex, 
  onNavigate, 
  failedQuestionIds,
  refQuestionIndex,
  onClose,
  className = "",
}: QuestionPaletteProps) {
  const getCustomClasses = (idx: number, qId: string) => {
    const status = statuses[qId];
    let classes = "w-10 h-10 p-0 rounded-md relative transition-all duration-200 border-2 font-medium flex items-center justify-center ";
    
    if (!status?.visited) {
      classes += "border-border bg-card text-muted-foreground ";
    } else if (status.answered && status.markedForReview) {
      classes += "border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 "; // Answered + Review
    } else if (status.markedForReview) {
      classes += "border-amber-400 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 "; // Review but unanswered
    } else if (status.answered) {
      classes += "border-green-500 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 "; // Answered
    } else {
      classes += "border-red-400 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 "; // Visited but unanswered
    }

    if (idx === currentIndex) {
      if (!status?.visited) {
        classes += "ring-2 ring-slate-400 dark:ring-slate-500 ring-offset-1 font-bold ";
      } else if (status.answered && status.markedForReview) {
        classes += "ring-2 ring-purple-500 ring-offset-1 font-bold ";
      } else if (status.markedForReview) {
        classes += "ring-2 ring-amber-400 ring-offset-1 font-bold ";
      } else if (status.answered) {
        classes += "ring-2 ring-green-500 ring-offset-1 font-bold ";
      } else {
        classes += "ring-2 ring-red-400 ring-offset-1 font-bold ";
      }
    }
    return classes;
  };

  return (
    <aside className={`w-72 flex-shrink-0 border-l border-border bg-card flex flex-col font-sans ${className}`}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Question Palette</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Close question palette"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-4 border-b border-border">
        <div className="grid grid-cols-2 gap-y-3 text-xs text-foreground">
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-border rounded-md bg-card"></div> Not Visited</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-red-400 rounded-md bg-red-50 dark:bg-red-950"></div> Unanswered</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-green-500 rounded-md bg-green-50 dark:bg-green-950"></div> Answered</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-amber-400 rounded-md bg-amber-50 dark:bg-amber-950"></div> Marked</div>
          <div className="flex items-center gap-2 col-span-2"><div className="w-4 h-4 border-2 border-purple-500 rounded-md bg-purple-50 dark:bg-purple-950"></div> Answered &amp; Marked</div>
          {refQuestionIndex !== null && refQuestionIndex !== undefined && (
            <div className="flex items-center gap-2 col-span-2 text-blue-700 dark:text-blue-300 font-medium pt-1 border-t border-border/50">
              <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">ℹ</div> Reference Material (Q{refQuestionIndex + 1})
            </div>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="grid grid-cols-5 gap-2">
          {exam.questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => onNavigate(idx)}
              className={getCustomClasses(idx, q.id)}
              aria-label={`Go to question ${idx + 1}`}
            >
              {idx + 1}
              {failedQuestionIds?.has(q.id) && (
                <span className="absolute -top-1.5 -left-1.5 text-[9px] bg-rose-600 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-sm z-10" title="Save failed">
                  !
                </span>
              )}
              {statuses[q.id]?.markedForReview && (
                <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 rounded-full w-4 h-4 flex items-center justify-center border shadow-xs font-bold">
                  ★
                </span>
              )}
              {refQuestionIndex === idx && (
                <span 
                  className="absolute -bottom-1 -left-1 text-[9px] bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-xs z-10" 
                  title="Contains Reference Material"
                >
                  ℹ
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
