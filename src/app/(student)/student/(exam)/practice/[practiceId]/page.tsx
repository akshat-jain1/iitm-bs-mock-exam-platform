import Link from "next/link";
import { getPracticeSessionAction } from "@/app/(student)/student/(portal)/practice/actions";
import { StudyPaperClient } from "@/components/student/study/StudyPaperClient";
export const dynamic = "force-dynamic";
export default async function PracticePage({ params }: { params: Promise<{ practiceId: string }> }) {
  const { practiceId } = await params;
  let session;
  try { session = await getPracticeSessionAction(practiceId); }
  catch (e) { return <div className="p-8 space-y-4"><h1 className="text-xl font-bold">Practice unavailable</h1><p>{e instanceof Error ? e.message : "Unable to load practice"}</p><Link href="/student/practice" className="text-blue-600 underline">Back to practice</Link></div>; }
  return <StudyPaperClient key={`${practiceId}-${session.completed}`} review={session.review} practice={session} />;
}
