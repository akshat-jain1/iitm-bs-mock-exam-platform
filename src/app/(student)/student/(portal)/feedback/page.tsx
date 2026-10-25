import { Metadata } from "next";
import { getStudentFeedbackListAction, getFeedbackContextOptionsAction } from "./actions";
import { StudentFeedbackClient } from "./StudentFeedbackClient";

export const metadata: Metadata = {
  title: "Feedback Centre | IITM Mock Exam Platform",
  description: "Submit feature requests, report technical problems, or flag question corrections.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudentFeedbackPage() {
  const [submissions, contextOptions] = await Promise.all([
    getStudentFeedbackListAction(),
    getFeedbackContextOptionsAction(),
  ]);

  const feedbackEmail = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL || null;

  return (
    <StudentFeedbackClient
      initialSubmissions={submissions}
      contextOptions={contextOptions}
      feedbackEmail={feedbackEmail}
    />
  );
}
