import React from "react";
import { QuestionImages } from "./QuestionImages";
import { Question } from "@/lib/types/exam";
import { MathText } from "./MathText";

interface MSQQuestionProps {
  question: Question;
  response: string[] | null;
  onChange: (optionIds: string[]) => void;
  disabled?: boolean;
}

export function MSQQuestion({ question, response, onChange, disabled }: MSQQuestionProps) {
  if (!question.options) return null;

  const selectedIds = response || [];

  const handleToggle = (optId: string) => {
    if (disabled) return;
    if (selectedIds.includes(optId)) {
      onChange(selectedIds.filter(id => id !== optId));
    } else {
      onChange([...selectedIds, optId]);
    }
  };

  return (
    <div className="space-y-3 mt-6">
      {question.options.map((opt) => {
        const isSelected = selectedIds.includes(opt.id);
        return (
          <label 
            key={opt.id} 
            className={`flex items-start space-x-3 p-4 border rounded-md transition-colors ${
              disabled ? "cursor-not-allowed opacity-85 select-none" : "cursor-pointer"
            } ${
              isSelected 
                ? "border-primary bg-primary/10" 
                : disabled ? "border-border bg-slate-50/50 dark:bg-slate-950/50" : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex h-5 items-center">
              <input 
                type="checkbox" 
                name={`msq-${question.id}-${opt.id}`} 
                disabled={disabled}
                className={`w-4 h-4 rounded text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-blue-500 focus:ring-2 ${
                  disabled ? "cursor-not-allowed opacity-60" : ""
                }`}
                checked={isSelected}
                onChange={() => handleToggle(opt.id)}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {(() => {
                const isReferToImage = Boolean(opt.text && /refer to option image/i.test(opt.text.trim()));
                const images = (() => {
                  if (opt.imageUrls && Array.isArray(opt.imageUrls) && opt.imageUrls.length > 0) {
                    return opt.imageUrls;
                  }
                  if (opt.imageUrl) return [opt.imageUrl];
                  if (opt.image_assets) {
                    type AssetRef = { url?: string; storage_path?: string };
                    const list = (Array.isArray(opt.image_assets)
                      ? opt.image_assets
                      : [opt.image_assets]) as AssetRef[];
                    return list
                      .filter((a) => a && typeof a.url === "string" && /^https?:\/\//i.test(a.url))
                      .map((a) => a.url as string);
                  }
                  return [];
                })();

                return (
                  <>
                    {opt.text && opt.text !== "[Image]" && !isReferToImage && (
                      <MathText text={opt.text} html={opt.textHtml} className="text-base leading-snug" />
                    )}
                    <QuestionImages assets={opt.images} urls={images} label="Option visual" option />
                    {opt.text === "[Image]" && images.length === 0 && (
                      <div className="text-base leading-snug text-muted-foreground italic">[Image]</div>
                    )}
                  </>
                );
              })()}
            </div>
          </label>
        );
      })}
    </div>
  );
}
