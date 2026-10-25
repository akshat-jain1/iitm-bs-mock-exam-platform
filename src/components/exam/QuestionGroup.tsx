import React from "react";
import { QuestionGroup as QuestionGroupType } from "@/lib/types/exam";
import { CodeBlock } from "./CodeBlock";
import { ReferenceData } from "./ReferenceData";
import { MathText } from "./MathText";

interface QuestionGroupProps {
  group: QuestionGroupType;
}

export function QuestionGroup({ group }: QuestionGroupProps) {
  return (
    <div className="mb-8 p-4 sm:p-6 bg-muted/20 border-l-4 border-l-primary rounded-r-md">
      <h3 className="text-lg font-bold mb-3 flex items-center">
        <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded uppercase tracking-wider mr-3">Comprehension Group</span>
        {group.title}
      </h3>
      <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
        <MathText text={group.passage} html={group.passageHtml} className="text-base leading-relaxed text-slate-800 dark:text-slate-100" />
      </div>
      
      {(() => {
        const images = group.imageUrls && group.imageUrls.length > 0
          ? group.imageUrls
          : group.imageUrl ? [group.imageUrl] : [];
        if (images.length === 0) return null;
        return (
          <div className="my-4 space-y-4">
            {images.map((imgUrl, imgIdx) => (
              <div key={imgIdx} className="overflow-x-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl}
                  alt={`Group visual ${imgIdx + 1}`}
                  decoding="async"
                  className="w-full max-w-3xl h-auto rounded border border-border shadow-sm object-contain bg-white"
                />
              </div>
            ))}
          </div>
        );
      })()}
      
      {group.codeSnippet && <CodeBlock code={group.codeSnippet} />}

      {group.referenceMaterial && (
        <div className="mt-4 mb-2">
          <ReferenceData data={group.referenceMaterial} />
        </div>
      )}
    </div>
  );
}
