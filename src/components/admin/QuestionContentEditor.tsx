"use client";

import { useRef, useState } from "react";
import { imageAssets, QuestionImageAsset } from "@/lib/question-images";
import { QuestionImageEditor } from "./QuestionImageEditor";

export function QuestionContentEditor({ label, text, images, onTextChange, onImagesChange, paperId, onBusyChange, onUploaded, compact = false }: {
  label: string;
  text: string;
  images?: unknown;
  onTextChange: (text: string) => void;
  onImagesChange: (images: QuestionImageAsset[]) => void;
  paperId: string;
  onBusyChange: (busy: boolean) => void;
  onUploaded: (path: string) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"text" | "image">(imageAssets(images).length ? "image" : "text");
  const [showText, setShowText] = useState(Boolean(text.trim()));
  const draft = useRef({ text, images: imageAssets(images) });

  function changeMode(next: "text" | "image") {
    if (next === mode) return;
    if (mode === "text") draft.current.text = text;
    else draft.current.images = imageAssets(images);
    onImagesChange(next === "image" ? draft.current.images : []);
    onTextChange(next === "text" ? draft.current.text : "");
    setShowText(false);
    setMode(next);
  }

  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 p-0.5" role="group" aria-label={`${label} format`}>
        {(["text", "image"] as const).map((format) => <button key={format} type="button" aria-pressed={mode === format}
          onClick={() => changeMode(format)}
          className={`rounded px-3 py-1 text-xs font-medium ${mode === format ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`}>
          {format === "text" ? "Text" : "Image"}
        </button>)}
      </div>
    </div>
    {mode === "image" && <QuestionImageEditor value={images} onChange={(assets) => {
      draft.current.images = assets;
      onImagesChange(assets);
    }} paperId={paperId} label={label} onBusyChange={onBusyChange} onUploaded={onUploaded} />}
    {(mode === "text" || showText) && <label className="block text-sm">
      {mode === "image" && <span className="mb-1 block text-xs text-slate-500">Text with this image (optional)</span>}
      <textarea aria-label={`${label} text`} value={text} rows={compact ? 2 : 4}
        placeholder={mode === "image" ? "Add any text that should appear with the image…" : `Enter ${label.toLowerCase()}…`}
        onChange={(event) => { draft.current.text = event.target.value; onTextChange(event.target.value); }}
        className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>}
    {mode === "image" && <button type="button" className="text-xs font-medium text-blue-600 dark:text-blue-400" onClick={() => {
      onTextChange(showText ? "" : draft.current.text);
      setShowText(!showText);
    }}>{showText ? "Remove text" : "+ Add text (optional)"}</button>}
  </div>;
}
