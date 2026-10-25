import React from "react";
import { useRouter } from "next/navigation";
import { Exam } from "@/lib/types/exam";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { ScientificCalculator } from "@/components/exam/ScientificCalculator";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

interface ExamHeaderProps {
  exam: Exam;
}

export function ExamHeader({ exam }: ExamHeaderProps) {
  const router = useRouter();
  // Mock simulated timer logic for demonstration
  const [timeLeft, setTimeLeft] = React.useState(exam.durationSeconds);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="border-b border-border bg-card px-8 py-4 flex justify-between items-center shadow-sm z-10 font-sans relative">
      <div className="flex flex-col">
        <h1 className="font-semibold text-lg text-foreground tracking-tight">{exam.title}</h1>
        <div className="flex items-center space-x-4 mt-0.5 text-sm text-muted-foreground">
          <span>{exam.candidateName}</span>
          <span className="text-border">|</span>
          <span className="font-mono">{exam.candidateId}</span>
        </div>
      </div>
      <div className="flex items-center space-x-3 sm:space-x-5">
        <ThemeToggle />
        <ScientificCalculator />

        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Time Remaining</span>
          <Badge variant={timeLeft < 300 ? "destructive" : "secondary"} className={`text-lg font-mono py-1 px-4 tracking-widest ${timeLeft < 300 ? "" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"}`}>
            {formatTime(timeLeft)}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>
    </header>
  );
}
