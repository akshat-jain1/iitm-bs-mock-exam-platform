import type { QuestionReviewItem } from "@/app/(student)/student/(portal)/results/actions";
import { MathText } from "@/components/exam/MathText";
import { QuestionImages } from "@/components/exam/QuestionImages";
import { Button } from "@/components/ui/Button";

export function ReviewAnswer({ question, answer, loading, onReveal }: {
  question: QuestionReviewItem;
  answer?: QuestionReviewItem;
  loading: boolean;
  onReveal: () => void;
}) {
  if (question.status === "CORRECT") return <p className="text-green-700 dark:text-green-300 font-medium">Your answer is correct.</p>;
  if (!answer) return <Button variant="outline" onClick={onReveal} disabled={loading}>{loading ? "Loading…" : "Show correct answer"}</Button>;
  const correctOptions = answer.options?.filter(o => o.isCorrect) || [];
  return <div className="space-y-3" aria-live="polite"><h3 className="font-semibold text-green-700 dark:text-green-300">Correct answer</h3>
    {answer.type === "NUMERICAL" ? <p>{answer.correctAnswerText || "Answer key unavailable"}</p>
      : correctOptions.length ? correctOptions.map(o => <div key={o.id} className="p-3 border border-green-500 rounded-md"><MathText text={o.text} html={o.textHtml} /><QuestionImages assets={o.images} urls={o.imageUrls || (o.imageUrl ? [o.imageUrl] : [])} label="Correct option visual" /></div>)
      : <p>Answer key unavailable</p>}
  </div>;
}
