import Link from "next/link";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";
import { assignmentLabel } from "@/lib/assessment-access";
import { getStudentExamHistoryAction } from "../results/actions";
import { getPracticeHistoryAction } from "./actions";
import { PracticeButton } from "@/components/student/study/PracticeButton";
export const dynamic = "force-dynamic";
export default async function PracticeLibraryPage() {
  const user = await getCachedUser();
  const isTester = !!user && await getCachedUserRole(user, { skipJwtClaim: true }) === "tester";
  const [papers, history] = await Promise.all([getStudentExamHistoryAction(), getPracticeHistoryAction()]);
  const subjects = papers.flatMap(p => p.subjects.map(s => ({ ...s, assessmentId: p.assessmentId, title: p.assessmentTitle, isTest: p.isTest })));
  const unique = subjects.filter((s, index) => subjects.findIndex(other => other.assessmentId === s.assessmentId && other.subjectId === s.subjectId) === index);
  return <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8"><div><h1 className="text-3xl font-bold">Practice mode</h1><p className="text-muted-foreground mt-2">Revisit a completed paper at your own pace. Unlimited, untimed practice with saved progress and separate scores.</p><p className="text-sm text-muted-foreground mt-2">{isTester ? "Test papers unlock after evaluation. Production papers unlock after evaluation and the exam closes. Practice does not use your test retake allowance." : "Practise the subjects you took in your exams. Papers unlock after your exam closes and your result is evaluated."}</p></div>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Your papers</h2>{!unique.length && <p className="text-muted-foreground">{isTester ? "Complete an exam or test assignment to find its papers here." : "Complete an exam to find your subject papers here."}</p>}
      <div className="grid md:grid-cols-2 gap-4">{unique.map(s => <article key={s.attemptId} className="rounded-xl border border-border bg-card p-5 space-y-3"><p className="text-xs text-muted-foreground">{assignmentLabel(isTester, s.isTest)}</p><h3 className="font-semibold">{s.title} · {s.subjectName}</h3>{s.canReviewAnswers ? <PracticeButton attemptId={s.attemptId} /> : <p className="text-sm text-muted-foreground">{s.reviewBlockedReason}</p>}</article>)}</div>
    </section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Your practice sessions</h2>{!history.length && <p className="text-muted-foreground">Your saved progress and completed practice results will appear here.</p>}
      {history.map(h => { const s = subjects.find(s => s.attemptId === h.source_attempt_id); return <article key={h.id} className="rounded-xl border border-border bg-card p-5 flex flex-wrap justify-between gap-4"><div><h3 className="font-semibold">{s ? `${s.title} · ${s.subjectName}` : "Practice paper"}</h3><p className="text-sm text-muted-foreground">{h.status} · Started {new Date(h.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{h.status === "Completed" && ` · Score: ${h.score} / ${h.max_marks}`}</p></div><Link href={`/student/practice/${h.id}`} className="text-primary font-semibold self-center">{h.status === "Completed" ? "Review practice" : "Resume practice"} →</Link></article>; })}
    </section>
  </div>;
}
