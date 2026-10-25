import { Metadata } from "next";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { getAdminFeedbackListAction } from "./actions";
import { AdminFeedbackClient } from "./AdminFeedbackClient";

export const metadata: Metadata = {
  title: "Feedback & Triage Inbox | Admin Portal",
  description: "Review, manage, and track student feedback, bug reports, and question corrections.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminFeedbackPage() {
  await verifyAdmin();
  const initialData = await getAdminFeedbackListAction({
    page: 1,
    pageSize: 20,
    status: "all",
    category: "all",
  });

  return <AdminFeedbackClient initialData={initialData} />;
}
