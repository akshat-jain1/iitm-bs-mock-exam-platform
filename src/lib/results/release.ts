/** Keep the release rule shared by listings, review, reveal and practice. */
export function reviewBlockedReason(isTest: boolean, resultStatus: string, eventStatus: string): string | undefined {
  if (!isTest && eventStatus !== "Completed" && eventStatus !== "Archived") {
    return "Available once the examination window closes";
  }
  if (resultStatus !== "Evaluated") return "Evaluation is pending faculty review";
  return undefined;
}
