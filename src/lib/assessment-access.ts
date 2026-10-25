/** Only testers and administrators see internal test assignments. */
export function canAccessAssignment(role: string, assignmentType: string, isTest = false): boolean {
  if (role === "tester" || role === "admin") return true;
  return role === "student" && assignmentType === "PRODUCTION" && !isTest;
}

export function assignmentLabel(isTester: boolean, isTest: boolean): string {
  return isTester ? (isTest ? "Test assignment" : "Production exam") : "Exam";
}
