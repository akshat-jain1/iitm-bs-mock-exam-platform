export const SAVE_GRACE_MS = 30_000;

export interface PendingExamResponse {
  attemptId: string;
  questionId: string;
  payload: unknown;
  markedForReview: boolean;
}

export type ActionErrorCode = "EXPIRED" | "UNAUTHORIZED" | "INVALID" | "TRANSIENT";

export type ActionResult<T = unknown> =
  | { success: true; result?: T }
  | { success: false; code: ActionErrorCode; message: string };
