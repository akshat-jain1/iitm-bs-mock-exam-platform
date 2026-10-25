import React from "react";
import { redirect } from "next/navigation";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { getStudentResultsAction, getStudentExamHistoryAction } from "./actions";
import { StudentResultsClient } from "./StudentResultsClient";

export const dynamic = "force-dynamic";

export default async function StudentResultsPage() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCachedUserRole(user, { skipJwtClaim: true });
  const [results, historySessions] = await Promise.all([
    getStudentResultsAction(),
    getStudentExamHistoryAction(),
  ]);

  return <StudentResultsClient exams={results} historySessions={historySessions} isTester={role === "tester"} />;
}
