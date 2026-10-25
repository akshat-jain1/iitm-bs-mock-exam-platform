"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startPracticeAction } from "@/app/(student)/student/(portal)/practice/actions";
import { Button } from "@/components/ui/Button";
export function PracticeButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div><Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { const id = await startPracticeAction(attemptId); router.push(`/student/practice/${id}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to start practice"); setBusy(false); }
  }}>{busy ? "Opening…" : "Practise this paper"}</Button>{error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}</div>;
}
