"use client";

import { assignmentLabel } from "@/lib/assessment-access";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuestionReviewItem, StudentAttemptReviewResult } from "@/app/(student)/student/(portal)/results/actions";
import { revealCorrectAnswerAction } from "@/app/(student)/student/(portal)/results/actions";
import { savePracticeAction, revealPracticeAnswerAction } from "@/app/(student)/student/(portal)/practice/actions";
import type { Exam, ExamResponses, ExamStatuses, ResponseValue } from "@/lib/types/exam";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { QuestionPalette } from "@/components/exam/QuestionPalette";
import { ScientificCalculatorDialog } from "@/components/exam/ScientificCalculatorDialog";
import { ReviewAnswer } from "./ReviewAnswer";
import { ThemeToggle } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { PracticeButton } from "./PracticeButton";

type Props = {
  review: StudentAttemptReviewResult;
  practice?: { id: string; completed: boolean; revision: number; responses: ExamResponses; markedIds: string[] };
};
const statusColors: Record<string, string> = {
  CORRECT: "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  INCORRECT: "border-red-400 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  UNANSWERED: "border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  PENDING: "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export function StudyPaperClient({ review, practice }: Props) {
  const router = useRouter();
  const questions = review.questions || [];
  const activePractice = !!practice && !practice.completed;
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<ExamResponses>(practice?.responses || {});
  const [markedIds, setMarkedIds] = useState<string[]>(practice?.markedIds || []);
  const [visited, setVisited] = useState<string[]>(questions[0] ? [questions[0].id] : []);
  const [revealed, setRevealed] = useState<Record<string, QuestionReviewItem>>({});
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [calculator, setCalculator] = useState(false);
  const [palette, setPalette] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("All changes saved");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const revision = useRef(practice?.revision || 0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef({ responses, markedIds });
  const saved = useRef(JSON.stringify({ responses, markedIds }));
  useEffect(() => { latest.current = { responses, markedIds }; }, [responses, markedIds]);

  function persist(submit = false) {
    if (!practice || !activePractice) return Promise.resolve();
    const snapshot = latest.current;
    const serialized = JSON.stringify(snapshot);
    setSaveLabel("Saving…"); setSaving(true);
    const task = queue.current.catch(() => {}).then(async () => {
      const result = await savePracticeAction(practice.id, snapshot.responses, snapshot.markedIds, revision.current, submit);
      revision.current = result.revision;
      saved.current = serialized;
      setSaveLabel(JSON.stringify(latest.current) === serialized ? "All changes saved" : "Unsaved changes");
      setError("");
    });
    queue.current = task;
    return task.catch(e => { setSaveLabel("Save failed — retry below"); setError(e instanceof Error ? e.message : "Unable to save"); throw e; }).finally(() => setSaving(false));
  }

  useEffect(() => {
    if (!activePractice || submitting || saved.current === JSON.stringify({ responses, markedIds })) return;
    setSaveLabel("Unsaved changes");
    const timeout = setTimeout(() => { void persist().catch(() => {}); }, 800);
    return () => clearTimeout(timeout);
    // Persist always reads the latest response snapshot; revision and queue are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, markedIds, activePractice, submitting]);

  useEffect(() => {
    if (!activePractice) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (saved.current !== JSON.stringify(latest.current)) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [activePractice]);

  if (!questions.length) return <div className="p-8">No questions available. <Link href="/student/results">Back to results</Link></div>;
  const question = questions[index];
  const exam: Exam = { id: review.attemptId || "review", title: review.assessmentTitle || "Paper", candidateName: "", candidateId: "", durationSeconds: 0,
    questions, groups: review.groups || [], sections: review.sections, referenceMaterial: review.referenceMaterial };
  const group = exam.groups.find(g => g.id === question.groupId);
  const section = exam.sections?.find(s => s.id === question.sectionId);
  const statuses: ExamStatuses = Object.fromEntries(questions.map(q => {
    const value = responses[q.id];
    return [q.id, { visited: visited.includes(q.id) || value != null, answered: value != null && value !== "" && (!Array.isArray(value) || value.length > 0), markedForReview: markedIds.includes(q.id) }];
  }));
  const reviewResponse: ResponseValue = question.type === "NUMERICAL" ? question.studentAnswerText ?? null
    : question.type === "MCQ" ? question.options?.find(o => o.isStudentSelected)?.id ?? null
    : question.options?.filter(o => o.isStudentSelected).map(o => o.id) || [];
  const answer = revealed[question.id];
  const visibleQuestions = questions.filter(q => filter === "ALL" || q.status === filter);

  function navigate(next: number) {
    if (next < 0 || next >= questions.length) return;
    setIndex(next); setVisited(v => [...new Set([...v, questions[next].id])]); setPalette(false);
  }
  async function reveal() {
    setLoadingAnswer(true); setError("");
    try {
      const q = practice ? await revealPracticeAnswerAction(practice.id, question.id) : await revealCorrectAnswerAction(review.attemptId!, question.id);
      setRevealed(old => ({ ...old, [q.id]: q }));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load answer"); }
    finally { setLoadingAnswer(false); }
  }
  async function finish() {
    setSubmitting(true);
    try { await persist(true); router.refresh(); }
    catch { setSubmitting(false); setConfirmSubmit(false); }
  }
  async function exit() {
    if (activePractice) { setSubmitting(true); try { await persist(); } catch { setSubmitting(false); return; } }
    router.push(practice ? "/student/practice" : "/student/results");
  }

  return <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950 text-foreground font-sans">
    <div className={`px-5 py-2 text-sm text-white ${practice ? "bg-purple-700" : "bg-blue-700"}`}>
      <strong>{activePractice ? "PRACTICE MODE" : practice ? "PRACTICE REVIEW" : "EXAM REVIEW"}</strong>
      <span className="ml-3">{activePractice ? "Untimed • Progress saves automatically • Your official results stay separate" : "Review your responses. Reveal each correct answer when you are ready."}</span>
    </div>
    <header className="flex flex-wrap gap-3 justify-between items-center border-b border-border bg-card px-4 sm:px-8 py-4">
      <div><h1 className="font-bold text-lg">{review.assessmentTitle}</h1><p className="text-sm text-muted-foreground">{review.subjectName} · {assignmentLabel(!!review.isTester, !!review.isTest)}{!activePractice && ` · Score: ${review.score} / ${review.maxMarks}`}</p></div>
      <div className="flex flex-wrap items-center gap-3"><ThemeToggle />
        {activePractice && <span role="status" className="text-xs text-muted-foreground">{saveLabel}</span>}
        <Button variant="outline" onClick={() => setCalculator(v => !v)}>Calculator</Button>
        <Button variant="outline" onClick={() => setPalette(v => !v)} className="lg:hidden">Questions</Button>
        {!activePractice && review.attemptId && <PracticeButton attemptId={review.attemptId} />}
        <Button variant="outline" disabled={submitting} onClick={() => void exit() }>{activePractice ? "Save & exit" : "Exit review"}</Button>
      </div>
    </header>
    <nav aria-label="Subjects" className="flex gap-2 px-4 sm:px-8 pt-2 border-b border-border bg-card overflow-x-auto">
      {review.siblingSubjects?.length ? review.siblingSubjects.map(s => <Link key={s.attemptId} href={`/student/results/review/${s.attemptId}`} className={`px-5 py-3 whitespace-nowrap rounded-t-lg ${s.isCurrent ? "text-primary bg-primary/10 font-semibold" : "text-muted-foreground"}`}>{s.subjectName}</Link>) : <span className="px-5 py-3 rounded-t-lg text-primary bg-primary/10 font-semibold">{review.subjectName}</span>}
    </nav>
    {error && <div role="alert" className="px-5 py-3 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200">{error}{activePractice && <Button variant="outline" className="ml-3" disabled={saving} onClick={() => void persist().catch(() => {})}>Retry save</Button>}</div>}
    <div className="flex flex-1 min-h-0 relative">
      <div className="flex flex-col flex-1 min-w-0">
        {!activePractice && <div className="flex gap-4 items-center px-4 sm:px-8 py-3 border-b border-border text-sm"><span className={`px-3 py-1 rounded border font-semibold ${statusColors[question.status]}`}>{question.status.toLowerCase()} · {question.marksAwarded ?? 0} / {question.marks} marks</span><span className="text-muted-foreground">Your submitted response is shown below.</span></div>}
        <QuestionRenderer key={question.id} index={index} question={question} group={group} referenceMaterial={section?.referenceMaterial || exam.referenceMaterial}
          response={activePractice ? responses[question.id] ?? null : reviewResponse} disabled={!activePractice || submitting}
          onResponseChange={value => setResponses(old => ({ ...old, [question.id]: value }))} />
        {!activePractice && <div className="px-4 sm:px-8 py-4 border-t border-border bg-card max-h-[35vh] overflow-auto">
          <ReviewAnswer question={question} answer={answer} loading={loadingAnswer} onReveal={() => void reveal()} />
        </div>}
        <footer className="border-t border-border bg-card p-4 flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">{activePractice && <><Button variant="outline" disabled={submitting} onClick={() => { setMarkedIds(old => old.includes(question.id) ? old.filter(id => id !== question.id) : [...old, question.id]); navigate(Math.min(index + 1, questions.length - 1)); }}>{markedIds.includes(question.id) ? "Unmark" : "Mark for review"} & next</Button><Button variant="ghost" disabled={submitting} onClick={() => setResponses(old => ({ ...old, [question.id]: null }))}>Clear response</Button></>}</div>
          <div className="flex gap-2"><Button variant="outline" disabled={index === 0 || submitting} onClick={() => navigate(index - 1)}>Previous</Button><Button disabled={index === questions.length - 1 || submitting} onClick={() => navigate(index + 1)}>Next question</Button>{activePractice && <Button variant="destructive" disabled={submitting} onClick={() => setConfirmSubmit(true)}>Finish practice</Button>}</div>
        </footer>
      </div>
      {activePractice ? <QuestionPalette exam={exam} statuses={statuses} currentIndex={index} onNavigate={navigate} onClose={() => setPalette(false)} className={palette ? "absolute right-0 inset-y-0 z-20 shadow-xl lg:static" : "hidden lg:flex"} />
        : <aside className={`w-72 border-l border-border bg-card overflow-y-auto p-4 flex-shrink-0 ${palette ? "absolute right-0 inset-y-0 z-20 shadow-xl lg:static" : "hidden lg:block"}`}>
          <div className="flex justify-between mb-4"><h2 className="font-semibold uppercase text-sm text-muted-foreground">Question palette</h2><button className="lg:hidden" aria-label="Close question palette" onClick={() => setPalette(false)}>✕</button></div>
          <label htmlFor="review-filter" className="text-sm">Filter questions</label><select id="review-filter" value={filter} onChange={e => setFilter(e.target.value)} className="w-full p-2 my-3 border border-border rounded bg-card">{["ALL", "CORRECT", "INCORRECT", "UNANSWERED"].map(s => <option key={s} value={s}>{s.toLowerCase()} ({questions.filter(q => s === "ALL" || q.status === s).length})</option>)}</select>
          <div className="grid grid-cols-5 gap-2">{visibleQuestions.map(q => <button key={q.id} aria-label={`Question ${q.sequenceNumber}, ${q.status.toLowerCase()}`} aria-current={q.id === question.id ? "step" : undefined} onClick={() => navigate(questions.indexOf(q))} className={`w-10 h-10 border-2 rounded font-medium ${statusColors[q.status]} ${q.id === question.id ? "ring-2 ring-primary ring-offset-1" : ""}`}>{q.sequenceNumber}</button>)}</div>
          <p className="text-xs text-muted-foreground mt-5">Green: correct · Red: incorrect · Grey: unanswered</p>
        </aside>}
    </div>
    {calculator && <ScientificCalculatorDialog onClose={() => setCalculator(false)} />}
    {confirmSubmit && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-labelledby="finish-title" className="bg-card text-foreground rounded-xl p-6 max-w-md space-y-4"><h2 id="finish-title" className="font-bold text-xl">Finish this practice?</h2><p>You answered {Object.values(statuses).filter(s => s.answered).length} of {questions.length} questions. Your practice score and responses will be saved. You can start another practice afterwards.</p><div className="flex gap-3"><Button variant="outline" disabled={submitting} onClick={() => setConfirmSubmit(false)}>Keep practising</Button><Button disabled={submitting} onClick={() => void finish()}>{submitting ? "Saving result…" : "Finish & see result"}</Button></div></div></div>}
  </div>;
}
