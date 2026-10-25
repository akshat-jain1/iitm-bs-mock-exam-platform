import type { QuestionReviewItem, StudentAttemptReviewResult } from "@/app/(student)/student/(portal)/results/actions";
import type { ExamResponses, ResponseValue } from "@/lib/types/exam";

/** Explicitly omit keys before any review or practice data crosses the server boundary. */
export function hideAnswerKeys(review: StudentAttemptReviewResult): StudentAttemptReviewResult {
  return {
    ...review,
    questions: review.questions?.map(q => {
      const { correctAnswerText, numericalEvaluation, ...safe } = q;
      void correctAnswerText; void numericalEvaluation;
      return { ...safe, options: q.options?.map(({ isCorrect, ...option }) => { void isCorrect; return option; }) };
    }),
  };
}

export function gradePractice(questions: QuestionReviewItem[], responses: ExamResponses): QuestionReviewItem[] {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) throw new Error("Invalid responses");
  if (Object.keys(responses).some(id => !questions.some(q => q.id === id))) throw new Error("Unknown question");
  return questions.map(q => {
    const value: ResponseValue = responses[q.id] ?? null;
    let answered = value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
    let correct = false;
    let selected: string[] = [];
    let studentAnswerText: string | undefined;
    if (q.type === "NUMERICAL") {
      if (value !== null && value !== "" && ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value)) || String(value).trim() === "")) {
        throw new Error("Enter a valid numerical answer");
      }
      answered = answered && String(value).trim() !== "";
      studentAnswerText = answered ? String(value).trim() : undefined;
      const key = q.numericalEvaluation;
      correct = answered && !!key && (key.mode === "EXACT"
        ? key.exactVal != null && Number(value) === Number(key.exactVal)
        : key.minVal != null && key.maxVal != null && Number(value) >= Number(key.minVal) && Number(value) <= Number(key.maxVal));
    } else {
      if (answered && (q.type === "MCQ" ? typeof value !== "string" : !Array.isArray(value))) throw new Error("Invalid option answer");
      selected = answered ? (Array.isArray(value) ? [...new Set(value)] : [value as string]) : [];
      if (selected.some(id => !q.options?.some(o => o.id === id))) throw new Error("Invalid option");
      const keys = q.options?.filter(o => o.isCorrect).map(o => o.id) || [];
      correct = answered && keys.length > 0 && keys.length === selected.length && keys.every(id => selected.includes(id));
    }
    return {
      ...q,
      status: !answered ? "UNANSWERED" : correct ? "CORRECT" : "INCORRECT",
      marksAwarded: correct ? q.marks : 0,
      studentAnswerText,
      options: q.options?.map(o => ({ ...o, isStudentSelected: selected.includes(o.id) })),
    };
  });
}
