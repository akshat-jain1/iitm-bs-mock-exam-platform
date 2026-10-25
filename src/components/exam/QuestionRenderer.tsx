import React from "react";
import { QuestionImages } from "./QuestionImages";
import { Question, QuestionGroup as QuestionGroupType, ReferenceMaterial, ResponseValue } from "@/lib/types/exam";
import { Badge } from "@/components/ui/Badge";
import { CodeBlock } from "./CodeBlock";
import { QuestionGroup } from "./QuestionGroup";
import { ReferenceData } from "./ReferenceData";
import { MCQQuestion } from "./MCQQuestion";
import { MSQQuestion } from "./MSQQuestion";
import { NumericalQuestion } from "./NumericalQuestion";
import { MathText } from "./MathText";

interface QuestionRendererProps {
  index: number;
  question: Question;
  group?: QuestionGroupType;
  referenceMaterial?: ReferenceMaterial;
  designatedRefIndex?: number | null;
  onNavigateToRef?: (index: number) => void;
  response: ResponseValue;
  onResponseChange: (val: ResponseValue) => void;
  disabled?: boolean;
  isActive?: boolean;
}

export function QuestionRenderer({ 
  index, 
  question, 
  group, 
  referenceMaterial,
  designatedRefIndex,
  onNavigateToRef,
  response, 
  onResponseChange, 
  disabled,
  isActive,
}: QuestionRendererProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollContainerRef.current && (isActive ?? true)) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [question.id, isActive]);

  const getTypeName = (type: string) => {
    switch (type) {
      case "MCQ": return "Multiple Choice Question";
      case "MSQ": return "Multiple Select Question";
      case "NUMERICAL": return "Numerical Answer";
      default: return type;
    }
  };

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 font-sans select-none">
      {referenceMaterial && (
        <div className="mb-6">
          <ReferenceData data={referenceMaterial} />
        </div>
      )}

      {designatedRefIndex !== null && designatedRefIndex !== undefined && index !== designatedRefIndex && (
        <div className="mb-4 text-xs text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/70 border border-blue-200/60 dark:border-blue-800/60 rounded-md px-3.5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">ℹ️</span>
            <span>Reference material for this paper is located at <strong>Question {designatedRefIndex + 1}</strong>.</span>
          </div>
          {onNavigateToRef && (
            <button
              type="button"
              onClick={() => onNavigateToRef(designatedRefIndex)}
              className="font-semibold text-blue-800 dark:text-blue-200 hover:text-blue-950 dark:hover:text-blue-100 underline ml-3 shrink-0"
            >
              View Data →
            </button>
          )}
        </div>
      )}

      {group && <QuestionGroup group={group} />}
      
      <div className="flex justify-between items-start mb-6 pb-4 border-b border-border/60">
        <div>
          <h2 className="text-xl font-semibold mb-1 text-foreground">
            Question {index + 1}
            {question.sourceQuestionNumber && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (Source: Q{question.sourceQuestionNumber})
              </span>
            )}
          </h2>
          <div className="text-sm font-medium text-muted-foreground">{getTypeName(question.type)}</div>
        </div>
        <Badge variant="secondary" className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          Marks: {question.marks.toFixed(1)}
        </Badge>
      </div>
      
      <div className="prose prose-base dark:prose-invert text-slate-800 dark:text-slate-100 max-w-none mb-6">
        <MathText text={question.text} html={question.textHtml} className="text-base text-slate-800 dark:text-slate-100 leading-relaxed" />
      </div>

      {(() => {
        // Group image deduplication: do NOT render images in the child question if they already appear in the group context
        const groupImages = new Set(
          group?.imageUrls && group.imageUrls.length > 0
            ? group.imageUrls
            : group?.imageUrl ? [group.imageUrl] : []
        );

        const rawImages = question.imageUrls && question.imageUrls.length > 0
          ? question.imageUrls
          : question.imageUrl ? [question.imageUrl] : [];

        const images = rawImages.filter((url) => !groupImages.has(url));
        if (images.length === 0) return null;

        return <div className="my-6"><QuestionImages assets={question.images} urls={images} exclude={[...groupImages]} label={`Visual for Question ${index + 1}`} /></div>;
      })()}

      {question.codeSnippet && <CodeBlock code={question.codeSnippet} />}

      <div className="mt-8">
        {question.type === "MCQ" && (
          <MCQQuestion 
            question={question} 
            response={response as string | null} 
            onChange={onResponseChange} 
            disabled={disabled}
          />
        )}
        {question.type === "MSQ" && (
          <MSQQuestion 
            question={question} 
            response={response as string[] | null} 
            onChange={onResponseChange} 
            disabled={disabled}
          />
        )}
        {question.type === "NUMERICAL" && (
          <NumericalQuestion 
            question={question} 
            response={response as string | number | null} 
            onChange={onResponseChange} 
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
