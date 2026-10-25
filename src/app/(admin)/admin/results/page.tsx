import React from "react";
import { getExamResultsListAction } from "./actions";
import { ResultsListClient } from "./ResultsListClient";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const exams = await getExamResultsListAction();

  return <ResultsListClient exams={exams} />;
}
