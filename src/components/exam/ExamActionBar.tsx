import React from "react";
import { Button } from "@/components/ui/Button";
import { ExamStatuses } from "@/lib/types/exam";

interface ExamActionBarProps {
  onPrevious: () => void;
  onNext: () => void;
  onClearResponse: () => void;
  onToggleReview: () => void;
  onSubmit: () => void;
  isFirst: boolean;
  isLast: boolean;
  status: ExamStatuses[string];
  submitDisabled?: boolean;
  isAttemptable?: boolean;
}

export function ExamActionBar({
  onPrevious,
  onNext,
  onClearResponse,
  onToggleReview,
  onSubmit,
  isFirst,
  isLast,
  status,
  submitDisabled = false,
  isAttemptable = true,
}: ExamActionBarProps) {
  return (
    <footer className="border-t border-border bg-card px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap gap-2.5 sm:gap-4 justify-between items-center font-sans z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <div className="flex flex-wrap gap-2 items-center">
        <Button 
          variant={status?.markedForReview ? "secondary" : "outline"} 
          onClick={onToggleReview}
          disabled={!isAttemptable}
          className={
            !isAttemptable 
              ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700 text-slate-400"
              : status?.markedForReview 
              ? "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 border-transparent text-xs sm:text-sm"
              : "text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 text-xs sm:text-sm"
          }
        >
          {status?.markedForReview ? "★ Unmark Review & Next" : "☆ Mark for Review & Next"}
        </Button>
        <Button 
          variant="ghost" 
          onClick={onClearResponse} 
          disabled={!isAttemptable}
          className={!isAttemptable ? "opacity-40 cursor-not-allowed text-slate-400 text-xs sm:text-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 text-xs sm:text-sm"}
        >
          Clear Response
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" onClick={onPrevious} disabled={isFirst} className="text-xs sm:text-sm">
          Previous
        </Button>
        <Button 
          variant="primary" 
          onClick={onNext} 
          disabled={isLast}
          className={!isAttemptable ? "bg-slate-700 hover:bg-slate-800 text-white text-xs sm:text-sm" : "text-xs sm:text-sm"}
        >
          {isAttemptable ? "Submit & Next" : "Next Question"}
        </Button>
        <div className="hidden sm:block w-px h-6 bg-border mx-1"></div>
        <Button 
          variant={submitDisabled ? "secondary" : "destructive"} 
          onClick={onSubmit}
          disabled={submitDisabled}
          title={submitDisabled ? "Submit becomes available after 90 minutes" : "Submit Exam"}
          className="text-xs sm:text-sm"
        >
          {submitDisabled ? "Submit Locked" : "Submit Exam"}
        </Button>
      </div>
    </footer>
  );
}
