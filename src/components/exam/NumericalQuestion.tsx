import React from "react";
import { Question } from "@/lib/types/exam";
import { Input } from "@/components/ui/Input";

interface NumericalQuestionProps {
  question: Question;
  response: number | string | null;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function NumericalQuestion({ question, response, onChange, disabled }: NumericalQuestionProps) {
  return (
    <div className="mt-6">
      <div className="max-w-xs">
        <label htmlFor={`num-${question.id}`} className="block text-sm font-medium mb-2 text-muted-foreground">
          Enter your numerical answer:
        </label>
        <Input 
          id={`num-${question.id}`}
          type="number" 
          step="any"
          disabled={disabled}
          placeholder={disabled ? "Answer disabled (Not selected)" : "e.g. 42.5"} 
          value={response === null ? "" : response.toString()}
          onChange={(e) => !disabled && onChange(e.target.value)}
          className={`text-lg py-6 select-text ${disabled ? "bg-slate-100 dark:bg-slate-800 cursor-not-allowed opacity-80" : ""}`}
        />
      </div>
    </div>
  );
}
