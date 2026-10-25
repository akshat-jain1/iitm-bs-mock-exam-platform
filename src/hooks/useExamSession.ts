"use client";
import { useState, useCallback, useRef } from "react";
import { Exam, ExamResponses, ExamStatuses, ResponseValue } from "../lib/types/exam";

export interface ExamSessionOptions {
  initialResponses?: ExamResponses;
  initialStatuses?: ExamStatuses;
  onSaveResponse?: (questionId: string, value: ResponseValue | null, markedForReview: boolean) => Promise<void> | void;
}

export function useExamSession(exam: Exam, options: ExamSessionOptions = {}) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const initialStatuses: ExamStatuses = options.initialStatuses || (() => {
    const defaultStatuses: ExamStatuses = {};
    exam.questions.forEach((q, idx) => {
      const hasCommitted = !!(options.initialResponses && options.initialResponses[q.id] !== undefined && options.initialResponses[q.id] !== null && options.initialResponses[q.id] !== "");
      defaultStatuses[q.id] = {
        visited: idx === 0 || hasCommitted,
        answered: hasCommitted,
        markedForReview: false
      };
    });
    return defaultStatuses;
  })();
  
  const [statuses, setStatuses] = useState<ExamStatuses>(initialStatuses);
  const [draftResponses, setDraftResponses] = useState<ExamResponses>({});
  const [committedResponses, setCommittedResponses] = useState<ExamResponses>(options.initialResponses || {});

  // Ref mirrors for draft and committed responses to guarantee synchronous idempotency across event-loop ticks
  const draftResponsesRef = useRef<ExamResponses>({});
  const committedResponsesRef = useRef<ExamResponses>(options.initialResponses || {});

  const hasQuestions = Boolean(exam.questions && exam.questions.length > 0);
  const safeIndex = hasQuestions ? Math.min(Math.max(0, currentQuestionIndex), exam.questions.length - 1) : 0;
  const currentQuestion = hasQuestions ? exam.questions[safeIndex] : undefined;
  const currentQuestionId = currentQuestion?.id;
  
  const updateStatus = useCallback((qId: string, updates: Partial<ExamStatuses[string]>) => {
    setStatuses(prev => ({
      ...prev,
      [qId]: { ...prev[qId], ...updates }
    }));
  }, []);

  const setResponse = useCallback((value: ResponseValue) => {
    if (!currentQuestionId) return;
    draftResponsesRef.current[currentQuestionId] = value;
    setDraftResponses(prev => ({ ...prev, [currentQuestionId]: value }));
    // Do NOT update status or call onSaveResponse here. Draft state only.
  }, [currentQuestionId]);

  const commitResponse = useCallback(async (markForReview?: boolean) => {
    if (!currentQuestionId) return;
    const hasDraft = draftResponsesRef.current[currentQuestionId] !== undefined;
    const draftVal = draftResponsesRef.current[currentQuestionId];
    const committedVal = committedResponsesRef.current[currentQuestionId];
    
    const finalVal = hasDraft ? draftVal : committedVal;
    
    const isAnswered = Array.isArray(finalVal) ? finalVal.length > 0 : (finalVal !== null && finalVal !== undefined && finalVal !== "");
    
    const currentMarked = statuses[currentQuestionId]?.markedForReview || false;
    const nextMarked = markForReview !== undefined ? markForReview : currentMarked;
    const reviewChanged = nextMarked !== currentMarked;

    updateStatus(currentQuestionId, { 
      answered: isAnswered,
      markedForReview: nextMarked
    });

    if (hasDraft) {
      // Synchronously clear draft from ref and record committed to ensure strict idempotency in same tick
      delete draftResponsesRef.current[currentQuestionId];
      committedResponsesRef.current[currentQuestionId] = draftVal;

      setCommittedResponses(prev => ({ ...prev, [currentQuestionId]: draftVal }));
      setDraftResponses(prev => {
        const newRes = { ...prev };
        delete newRes[currentQuestionId];
        return newRes;
      });
      if (options.onSaveResponse) {
        options.onSaveResponse(currentQuestionId, draftVal, nextMarked);
      }
    } else if (reviewChanged) {
      if (options.onSaveResponse) {
        options.onSaveResponse(currentQuestionId, committedVal !== undefined ? committedVal : null, nextMarked);
      }
    }
  }, [currentQuestionId, statuses, updateStatus, options]);

  const navigateTo = useCallback((index: number) => {
    if (hasQuestions && index >= 0 && index < exam.questions.length) {
      if (currentQuestionId && draftResponsesRef.current[currentQuestionId] !== undefined) {
        commitResponse();
      }
      setCurrentQuestionIndex(index);
      const nextQId = exam.questions[index].id;
      updateStatus(nextQId, { visited: true });
    }
  }, [hasQuestions, exam.questions, updateStatus, currentQuestionId, commitResponse]);

  const handleNext = useCallback(() => navigateTo(safeIndex + 1), [safeIndex, navigateTo]);
  const handlePrev = useCallback(() => navigateTo(safeIndex - 1), [safeIndex, navigateTo]);

  const clearResponse = useCallback(async () => {
    if (!currentQuestionId) return;
    delete draftResponsesRef.current[currentQuestionId];
    delete committedResponsesRef.current[currentQuestionId];
    setDraftResponses(prev => {
      const newRes = { ...prev };
      delete newRes[currentQuestionId];
      return newRes;
    });
    setCommittedResponses(prev => {
      const newRes = { ...prev };
      delete newRes[currentQuestionId];
      return newRes;
    });
    const currentMarked = statuses[currentQuestionId]?.markedForReview || false;
    updateStatus(currentQuestionId, { answered: false });
    if (options.onSaveResponse) {
      options.onSaveResponse(currentQuestionId, null, currentMarked);
    }
  }, [currentQuestionId, statuses, updateStatus, options]);

  const toggleReview = useCallback(() => {
    if (!currentQuestionId) return;
    setStatuses(prev => ({
      ...prev,
      [currentQuestionId]: {
        ...prev[currentQuestionId],
        markedForReview: !prev[currentQuestionId]?.markedForReview
      }
    }));
  }, [currentQuestionId]);

  return {
    currentQuestionIndex: safeIndex,
    currentQuestion,
    statuses,
    draftResponses,
    committedResponses,
    navigateTo,
    handleNext,
    handlePrev,
    setResponse,
    clearResponse,
    toggleReview,
    commitResponse,
    isFirst: !hasQuestions || safeIndex === 0,
    isLast: !hasQuestions || safeIndex === exam.questions.length - 1
  };
}
