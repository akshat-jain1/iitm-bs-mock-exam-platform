"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ScientificCalculator } from "@/components/exam/ScientificCalculator";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

import { SaveStatus } from "@/lib/exam/save-queue";

interface SubjectTab {
  id: string; // subject attempt Id or virtual unselected Id
  name: string;
  isAttemptable?: boolean;
}

interface CombinedExamHeaderProps {
  assessmentTitle: string;
  candidateName: string;
  candidateId: string;
  expirationTimeMs: number;
  initialTimeLeft: number;
  subjects: SubjectTab[];
  activeSubjectId: string;
  onSubjectChange: (id: string) => void;
  onExit: () => void;
  saveStatus?: SaveStatus;
}

export function CombinedExamHeader({
  assessmentTitle,
  candidateName,
  candidateId,
  expirationTimeMs,
  initialTimeLeft,
  subjects,
  activeSubjectId,
  onSubjectChange,
  onExit,
  saveStatus,
}: CombinedExamHeaderProps) {
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor((expirationTimeMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [expirationTimeMs]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col border-b border-border bg-card z-10 shadow-sm relative font-sans">
      <div className="px-4 sm:px-8 py-3 flex flex-wrap justify-between items-center gap-3 min-h-[56px]">
        {/* Left Group: Title/Date + Candidate Info in ONE horizontal row */}
        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
          <h1 className="font-semibold text-base sm:text-lg text-foreground tracking-tight shrink-0">
            {assessmentTitle}
          </h1>
          <div className="flex items-center space-x-2 text-xs sm:text-sm text-muted-foreground truncate">
            <span className="truncate">{candidateName}</span>
            {candidateId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId) && (
              <>
                <span className="text-border">|</span>
                <span className="font-mono text-xs">{candidateId}</span>
              </>
            )}
          </div>
        </div>

        {/* Right Group: Toolbar actions in ONE horizontal row */}
        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
          <ThemeToggle />
          {saveStatus && (
            <div className="hidden sm:flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700">
              {saveStatus.state === "saving" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-slate-600 dark:text-slate-300">Saving…</span>
                </>
              )}
              {saveStatus.state === "saved" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-300">All changes saved</span>
                </>
              )}
              {saveStatus.state === "retrying" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-700 dark:text-amber-300">{saveStatus.message || "Unsaved - retrying…"}</span>
                </>
              )}
              {saveStatus.state === "error" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-rose-700 dark:text-rose-300 font-semibold max-w-[200px] truncate" title={saveStatus.message}>
                    {saveStatus.message ? `Could not save (${saveStatus.message})` : "Could not save"}
                  </span>
                </>
              )}
              {saveStatus.state === "idle" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <span className="text-slate-500 dark:text-slate-400">All changes saved</span>
                </>
              )}
            </div>
          )}

          <ScientificCalculator />

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap hidden sm:inline">
              Time Remaining
            </span>
            <Badge
              variant={timeLeft < 300 ? "destructive" : "secondary"}
              className={`text-base sm:text-lg font-mono py-1 px-3 sm:px-4 tracking-widest ${
                timeLeft < 300 ? "" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
              }`}
            >
              {formatTime(timeLeft)}
            </Badge>
          </div>

          <Button variant="outline" size="sm" onClick={onExit}>
            Exit Exam
          </Button>
        </div>
      </div>
      
      {/* Subject Tabs */}
      <div className="flex items-center px-8 space-x-1 bg-slate-50 dark:bg-slate-950 border-t border-border pt-2 overflow-x-auto">
        {subjects.map((subj) => (
          <button
            key={subj.id}
            onClick={() => onSubjectChange(subj.id)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border border-b-0 flex items-center gap-2 shrink-0 ${
              activeSubjectId === subj.id
                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 shadow-[0_4px_0_0_var(--card)] relative z-10 font-bold"
                : "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
            style={{ marginBottom: activeSubjectId === subj.id ? "-1px" : "0" }}
          >
            <span>{subj.name}</span>
            {subj.isAttemptable === false && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/60">
                Not Selected
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
