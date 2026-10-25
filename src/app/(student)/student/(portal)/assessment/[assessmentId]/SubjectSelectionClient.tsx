"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

import { startExamAction } from "@/app/(student)/student/actions";
import { requestBrowserFullscreen, isBrowserFullscreen } from "@/hooks/useExamIntegrity";
import type { StudentTestResultsData } from "@/app/(student)/student/(portal)/results/actions";

export interface EligibleSubject {
  id: string;
  assessmentSubjectId: string;
  code: string;
  name: string;
}

export interface ProductionCompletedSubject {
  id: string;
  code: string;
  name: string;
}

export interface ProductionSubmissionData {
  isSubmitted: boolean;
  submittedAt: string | null;
  subjects: ProductionCompletedSubject[];
  isEventClosed: boolean;
}

export function SubjectSelectionClient({ 
  assessmentId, 
  assessmentTitle,
  assessmentTypeName,
  eligibleSubjects,
  hasNoEnrollments = false,
  isTest = false,
  testDurationMins = null,
  testResults = null,
  productionSubmission = null,
  initialError = null,
  isCompleted = false,
}: { 
  assessmentId: string;
  assessmentTitle: string;
  assessmentTypeName: string;
  eligibleSubjects: EligibleSubject[];
  hasNoEnrollments?: boolean;
  isTest?: boolean;
  testDurationMins?: number | null;
  testResults?: StudentTestResultsData | null;
  productionSubmission?: ProductionSubmissionData | null;
  initialError?: string | null;
  isCompleted?: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => eligibleSubjects.slice(0, 4).map(s => s.id));
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  const resolveErrorMessage = (err: string | null | undefined): string | null => {
    if (!err) return null;
    if (err === "no_active_session") {
      return "No active exam session was found. Please select your subjects and click below to begin.";
    }
    if (err === "attempts_not_found") {
      return "Your exam attempts could not be verified. Please select your subjects and start again.";
    }
    if (err === "expired") {
      return "Your previous exam session has expired and answers were finalized.";
    }
    return err;
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(() => resolveErrorMessage(initialError));

  const hasAttempts = Boolean(testResults && testResults.allAttempts.length > 0);
  const [selectedAttemptNumber, setSelectedAttemptNumber] = useState<number | null>(
    () => testResults?.latestAttempt?.attemptNumber ?? null
  );
  const [isRetaking, setIsRetaking] = useState(false);

  const handleStartExam = async () => {
    if (isPending || isNavigating) return;
    setErrorMessage(null);

    const selectedAssessmentSubjectIds = eligibleSubjects
      .filter(s => selectedIds.includes(s.id))
      .map(s => s.assessmentSubjectId);

    if (selectedAssessmentSubjectIds.length === 0) {
      setErrorMessage("Please select at least one subject to begin the exam.");
      return;
    }

    // Request browser fullscreen directly from the user's click interaction
    let fullscreenEntered = false;
    try {
      fullscreenEntered = await requestBrowserFullscreen();
    } catch {
      fullscreenEntered = false;
    }

    const confirmedFullscreen = fullscreenEntered || isBrowserFullscreen();
    if (!confirmedFullscreen) {
      setErrorMessage(
        "Fullscreen mode is required to start the exam. Please allow fullscreen permission and click below to try again."
      );
      return;
    }

    setIsNavigating(true);
    startTransition(async () => {
      try {
        const result = await startExamAction(assessmentId, selectedAssessmentSubjectIds);
        if (result?.redirectUrl) {
          router.push(result.redirectUrl);
        } else {
          setIsNavigating(false);
        }
      } catch (err: unknown) {
        console.error("Failed to start exam", err);
        setIsNavigating(false);
        setErrorMessage(err instanceof Error ? err.message : "Failed to start exam");
      }
    });
  };

  const toggleSelection = (id: string) => {
    setErrorMessage(null);
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(s => s !== id);
      }
      if (prev.length >= 4) {
        setErrorMessage("You can select a maximum of 4 subjects.");
        return prev;
      }
      return [...prev, id];
    });
  };

  if (eligibleSubjects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{assessmentTitle}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">{assessmentTypeName} • No Subjects Available</p>
        </div>
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50 mb-2">
            {hasNoEnrollments ? "No Subjects Selected" : "No Eligible Subjects"}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            {hasNoEnrollments
              ? "You have not selected your subjects for this term yet. Please choose your subjects in your profile before entering this assessment."
              : "You are not actively enrolled in any subjects available for this assessment event."}
          </p>
          {hasNoEnrollments ? (
            <Link href="/student/profile" className="mt-6">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                Select your subjects first →
              </Button>
            </Link>
          ) : (
            <Link href="/student" className="mt-6">
              <Button variant="outline">
                Return to Dashboard
              </Button>
            </Link>
          )}
        </Card>
      </div>
    );
  }

  // Student-Facing Production Submission Confirmation & Completed State
  if (productionSubmission?.isSubmitted) {
    const formattedDate = productionSubmission.submittedAt
      ? new Date(productionSubmission.submittedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{assessmentTitle}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 uppercase tracking-wide">
                Official Examination
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {assessmentTypeName} • Final submission recorded
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/student">
              <Button variant="outline" size="sm">
                ← Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {isCompleted && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Your examination has been submitted successfully. Your answers have been recorded and locked.</span>
          </div>
        )}

        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/70 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-900 dark:text-slate-50">Submission Received &amp; Recorded</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {formattedDate ? `Recorded on ${formattedDate}` : "Attempt completed and evaluated"}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                Completed
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">Submitted Subjects ({productionSubmission.subjects.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {productionSubmission.subjects.map((sub) => (
                  <div key={sub.id} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{sub.name}</div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{sub.code}</div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded">
                      Submitted
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50/60 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 text-xs sm:text-sm leading-relaxed space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-blue-950 dark:text-blue-100">
                <span>ℹ️</span>
                <span>Academic Integrity &amp; Results Release Policy</span>
              </div>
              <p className="text-blue-900/90 dark:text-blue-200/90">
                Official examination results and answers are protected by academic integrity policies. Results will become available in the Results tab after the examination window closes and faculty evaluation is complete.
              </p>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Link href="/student" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto">
                Return to Dashboard
              </Button>
            </Link>
            <Link href="/student/results" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium">
                View Results &amp; History →
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Student-Facing Test Results Summary & History
  if (hasAttempts && !isRetaking && testResults) {
    const activeAttempt = testResults.allAttempts.find(
      (a) => a.attemptNumber === selectedAttemptNumber
    ) || testResults.latestAttempt || testResults.allAttempts[0];

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{assessmentTitle}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 uppercase tracking-wide">
                Test Result
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {assessmentTypeName} • Practice examination results &amp; performance breakdown
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/student">
              <Button variant="outline" size="sm">
                ← Dashboard
              </Button>
            </Link>
            {testResults.canRetake && (
              <Button
                onClick={() => setIsRetaking(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
              >
                Retake Exam ↻
              </Button>
            )}
          </div>
        </div>

        {isCompleted && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Your exam has been submitted and evaluated successfully. You can review your detailed results below.</span>
          </div>
        )}

        {/* Attempt Selector Tabs (if more than 1 attempt) */}
        {testResults.allAttempts.length > 1 && (
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-2 shrink-0">
              Attempts ({testResults.allAttempts.length}):
            </span>
            {testResults.allAttempts.map((att) => {
              const isSelected = att.attemptNumber === activeAttempt.attemptNumber;
              const isLatest = att.attemptNumber === testResults.latestAttempt?.attemptNumber;
              return (
                <button
                  key={att.attemptNumber}
                  onClick={() => setSelectedAttemptNumber(att.attemptNumber)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>Attempt #{att.attemptNumber}</span>
                  {isLatest && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                      isSelected ? "bg-purple-700 text-purple-100" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}>
                      Latest
                    </span>
                  )}
                  <span className={`text-[11px] font-mono ml-1 ${isSelected ? "text-purple-100" : "text-slate-500 dark:text-slate-400"}`}>
                    {att.overallScore}/{att.overallMaxMarks}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Primary Result Summary Card */}
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/70 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <span>Attempt #{activeAttempt.attemptNumber} Performance</span>
                  {activeAttempt.attemptNumber === testResults.latestAttempt?.attemptNumber && (
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                      Most Recent
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Evaluated at: {activeAttempt.evaluatedAt ? new Date(activeAttempt.evaluatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently Finalized"}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Total Score
                </span>
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {activeAttempt.overallScore}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> / {activeAttempt.overallMaxMarks > 0 ? activeAttempt.overallMaxMarks : "—"}</span>
                </span>
                {activeAttempt.overallPercentage !== null && (
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-300 ml-2">
                    ({activeAttempt.overallPercentage.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-4">
              Subject-wise Breakdown
            </h3>
            <div className="space-y-3">
              {activeAttempt.subjectResults.map((sub) => (
                <div
                  key={sub.attemptId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-950/40 gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-50 text-base">{sub.subjectName}</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/70 px-1.5 py-0.5 rounded">
                        {sub.subjectCode}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                      Status: <span className="text-emerald-700 dark:text-emerald-300 font-medium">{sub.status}</span>
                    </span>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-50">
                      {sub.score}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400"> / {sub.maxMarks}</span>
                    </span>
                    {sub.percentage !== null && (
                      <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 ml-2">
                        ({sub.percentage.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>

          {/* Retake Policy Footer */}
          <CardFooter className="bg-slate-50/60 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Attempt Policy: </span>
              {testResults.testAttemptPolicy === "UNLIMITED" ? (
                <span className="text-purple-700 dark:text-purple-300 font-medium">Unlimited retakes permitted for practice.</span>
              ) : (
                <span className={testResults.canRetake ? "text-slate-700 dark:text-slate-200" : "text-rose-700 dark:text-rose-300 font-semibold"}>
                  Limited to {testResults.testMaxAttempts} attempts ({testResults.totalAttemptsTaken} used).
                </span>
              )}
            </div>

            {testResults.canRetake ? (
              <Button
                onClick={() => setIsRetaking(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-xs w-full sm:w-auto"
              >
                Retake Exam (Attempt #{testResults.totalAttemptsTaken + 1}) →
              </Button>
            ) : (
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 px-3 py-1 rounded-md">
                Maximum Attempts Reached
              </span>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isReviewing) {
    const selectedSubjects = eligibleSubjects.filter((s) => selectedIds.includes(s.id));
    const selectedCount = selectedSubjects.length;
    const dynamicDuration = isTest && testDurationMins && testDurationMins > 0
      ? testDurationMins
      : Math.max(90, selectedCount * 60);
    const subjectLabel = selectedCount === 1 ? "1 Subject" : `${selectedCount} Subjects`;
    
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{assessmentTitle}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">{assessmentTypeName} • {subjectLabel} • {dynamicDuration} mins</p>
        </div>
        <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <CardTitle className="text-xl">Your Selected Subjects</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {errorMessage && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-800 dark:text-red-200 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}
            {selectedSubjects.map((subject) => (
            <div key={subject.id} className="flex justify-between items-center p-4 border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center space-x-3">
                <div className="text-green-600 dark:text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-50">{subject.name}</div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{subject.code}</div>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-4 text-center">
            * Starting an exam requires fullscreen mode. Your attempt will be created and the timer will start once fullscreen is activated.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/50">
          <Button variant="outline" onClick={() => setIsReviewing(false)} disabled={isPending || isNavigating} className="w-full sm:w-auto">
            Back to Selection
          </Button>
          <Button 
            onClick={handleStartExam}
            disabled={isPending || isNavigating}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
          >
            {isPending || isNavigating ? "Starting Exam..." : "Enter Fullscreen & Start Exam"}
          </Button>
        </CardFooter>
      </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasAttempts && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRetaking(false)}
            className="text-xs text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-200 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 hover:bg-purple-100 dark:hover:bg-purple-900"
          >
            ← Back to Results Summary
          </Button>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{assessmentTitle}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">{assessmentTypeName}</p>
      </div>
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-xl">Select Subjects</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select the subjects you want to attempt in this session. You can select up to 4 subjects.
              </p>
            </div>
            <div className={`text-xs font-semibold px-2.5 py-1 rounded-full self-start sm:self-auto border ${
              selectedIds.length === 4
                ? "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}>
              {selectedIds.length} / 4 subjects selected
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-800 dark:text-red-200 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {eligibleSubjects.map((subject) => {
            const isSelected = selectedIds.includes(subject.id);
            const isDisabled = !isSelected && selectedIds.length >= 4;

            return (
              <label 
                key={subject.id} 
                className={`flex items-start p-4 border rounded-md transition-colors ${
                  isSelected 
                    ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 cursor-pointer'
                    : isDisabled
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/60 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
                }`}
              >
                <div className="flex items-center h-5 mt-0.5">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 disabled:opacity-50"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => toggleSelection(subject.id)}
                  />
                </div>
                <div className="ml-3 flex flex-col flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${isDisabled ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-50'}`}>{subject.name}</span>
                    {isDisabled && (
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        Max 4 reached
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-0.5">{subject.code}</span>
                </div>
              </label>
            );
          })}

          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/60 border border-blue-200/70 dark:border-blue-800/70 rounded-lg text-xs text-blue-900 dark:text-blue-200 mt-4">
            <span className="font-semibold">Note:</span> Your selected subjects determine which questions you can attempt. Non-selected subjects from the examination paper will remain visible for reference, but their response controls will be disabled.
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/50">
          <Button variant="outline" onClick={() => window.history.back()} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            onClick={() => setIsReviewing(true)} 
            disabled={selectedIds.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
          >
            Continue
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
