"use client";

import React, { useRef, useState } from "react";
import { QuestionContentEditor } from "./QuestionContentEditor";
import { imageAssets, editableImageAssets } from "@/lib/question-images";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { QuestionSavePayload } from "@/app/(admin)/admin/question-bank/actions";

export interface OptionState {
  id?: string;
  text: string;
  sequence: number;
  is_correct: boolean;
  image_assets?: unknown | null;
}

export interface QuestionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: QuestionSavePayload) => Promise<{ success: boolean; error?: string }>;
  paperSetId: string;
  sectionId?: string | null;
  groupId?: string | null;
  initialQuestion?: {
    id: string;
    type: "MCQ" | "MSQ" | "NUMERICAL";
    text: string;
    marks: number;
    verification_status?:
      | "Ready"
      | "Needs Review"
      | "Missing Image"
      | "Code Needs Review"
      | "Answer Needs Review"
      | "Extraction Warning";
    code_content?: { language: string; content: string } | null;
    image_assets?: unknown | null;
    options?: OptionState[];
    eval_numeric?: {
      mode: "EXACT" | "RANGE";
      exact_val?: number | null;
      min_val?: number | null;
      max_val?: number | null;
    } | null;
  } | null;
}

const PROGRAMMING_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "sql",
  "bash",
];

export function UnifiedQuestionEditor(props: QuestionEditorProps) {
  if (!props.isOpen) return null;

  return (
    <QuestionEditorModalContent
      key={props.initialQuestion?.id || "new-question"}
      {...props}
    />
  );
}

function QuestionEditorModalContent({
  onClose,
  onSave,
  paperSetId,
  sectionId,
  groupId,
  initialQuestion,
}: QuestionEditorProps) {
  const [type, setType] = useState<"MCQ" | "MSQ" | "NUMERICAL">(
    initialQuestion?.type || "MCQ"
  );
  const [text, setText] = useState(initialQuestion?.text || "");
  const [marks, setMarks] = useState<number>(
    initialQuestion ? Number(initialQuestion.marks) : 1.0
  );
  const [verificationStatus, setVerificationStatus] = useState<
    | "Ready"
    | "Needs Review"
    | "Missing Image"
    | "Code Needs Review"
    | "Answer Needs Review"
    | "Extraction Warning"
  >(initialQuestion?.verification_status || "Ready");
  const [questionImages, setQuestionImages] = useState(() => editableImageAssets(initialQuestion?.image_assets));
  const [uploading, setUploading] = useState(false);
  const uploadedPaths = useRef(new Set<string>());
  const trackUpload = (path: string) => { uploadedPaths.current.add(path); };
  async function cleanupUploads(keep: Set<string>) {
    const paths = [...uploadedPaths.current].filter((path) => !keep.has(path));
    if (!paths.length) return;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().storage.from("question_assets").remove(paths);
      if (error) console.warn("Could not remove unused question uploads:", error.message);
      else paths.forEach((path) => uploadedPaths.current.delete(path));
    } catch { console.warn("Could not remove unused question uploads."); }
  }
  async function cancelEditor() {
    if (uploading || isSaving) return;
    setIsSaving(true);
    await cleanupUploads(new Set());
    onClose();
  }
  const [hasCode, setHasCode] = useState(Boolean(initialQuestion?.code_content));
  const [codeLanguage, setCodeLanguage] = useState(
    initialQuestion?.code_content?.language || "python"
  );
  const [codeContent, setCodeContent] = useState(
    initialQuestion?.code_content?.content || ""
  );

  // MCQ / MSQ Options
  const [options, setOptions] = useState<OptionState[]>(() => {
    if (initialQuestion?.options && initialQuestion.options.length > 0) {
      return initialQuestion.options.map((option) => ({ ...option, image_assets: imageAssets(option.image_assets).length ? editableImageAssets(option.image_assets) : option.image_assets }));
    }
    return [
      { text: "", sequence: 1, is_correct: true },
      { text: "", sequence: 2, is_correct: false },
      { text: "", sequence: 3, is_correct: false },
      { text: "", sequence: 4, is_correct: false },
    ];
  });

  // Numerical Evaluation
  const [numMode, setNumMode] = useState<"EXACT" | "RANGE">(
    initialQuestion?.eval_numeric?.mode || "EXACT"
  );
  const [exactVal, setExactVal] = useState<string>(() => {
    if (
      initialQuestion?.eval_numeric?.exact_val !== null &&
      initialQuestion?.eval_numeric?.exact_val !== undefined
    ) {
      return String(initialQuestion.eval_numeric.exact_val);
    }
    return "";
  });
  const [minVal, setMinVal] = useState<string>(() => {
    if (
      initialQuestion?.eval_numeric?.min_val !== null &&
      initialQuestion?.eval_numeric?.min_val !== undefined
    ) {
      return String(initialQuestion.eval_numeric.min_val);
    }
    return "";
  });
  const [maxVal, setMaxVal] = useState<string>(() => {
    if (
      initialQuestion?.eval_numeric?.max_val !== null &&
      initialQuestion?.eval_numeric?.max_val !== undefined
    ) {
      return String(initialQuestion.eval_numeric.max_val);
    }
    return "";
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddOption = () => {
    setOptions((prev) => [
      ...prev,
      { text: "", sequence: prev.length + 1, is_correct: false },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      setErrorMsg("A multiple-choice question must have at least 2 options.");
      return;
    }
    setOptions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((opt, i) => ({ ...opt, sequence: i + 1 }));
    });
  };

  const handleOptionTextChange = (index: number, val: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text: val };
      return next;
    });
  };

  const handleOptionCorrectToggle = (index: number) => {
    if (type === "MCQ") {
      setOptions((prev) =>
        prev.map((opt, i) => ({
          ...opt,
          is_correct: i === index,
        }))
      );
    } else {
      setOptions((prev) =>
        prev.map((opt, i) =>
          i === index ? { ...opt, is_correct: !opt.is_correct } : { ...opt }
        )
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (uploading || isSaving) return;

    const emptyOption = type !== "NUMERICAL" && options.findIndex((option) => !option.text.trim() && imageAssets(option.image_assets).length === 0);
    if (emptyOption !== false && emptyOption >= 0) {
      setErrorMsg(`Add text or an image to option ${String.fromCharCode(65 + emptyOption)}.`);
      return;
    }

    // Basic Validation
    if (!text.trim() && questionImages.length === 0) {
      setErrorMsg("Add text or an image to the question.");
      return;
    }

    if (marks <= 0 || isNaN(marks)) {
      setErrorMsg("Marks must be a positive number.");
      return;
    }

    if (type === "MCQ") {
      const validOptions = options.filter(
        (o) => o.text.trim().length > 0 || imageAssets(o.image_assets).length > 0
      );
      if (validOptions.length < 2) {
        setErrorMsg("Please provide content (text or image) for at least 2 options.");
        return;
      }
      const correctCount = options.filter((o) => o.is_correct && (o.text.trim() || imageAssets(o.image_assets).length)).length;
      if (correctCount !== 1) {
        setErrorMsg("MCQ must have exactly 1 correct option selected.");
        return;
      }
    } else if (type === "MSQ") {
      const validOptions = options.filter(
        (o) => o.text.trim().length > 0 || imageAssets(o.image_assets).length > 0
      );
      if (validOptions.length < 2) {
        setErrorMsg("Please provide content (text or image) for at least 2 options.");
        return;
      }
      const correctCount = options.filter((o) => o.is_correct && (o.text.trim() || imageAssets(o.image_assets).length)).length;
      if (correctCount === 0) {
        setErrorMsg("MSQ must have at least 1 correct option selected.");
        return;
      }
    } else if (type === "NUMERICAL") {
      if (numMode === "EXACT") {
        if (exactVal.trim() === "" || isNaN(Number(exactVal))) {
          setErrorMsg("Please enter a valid numeric exact value.");
          return;
        }
      } else if (numMode === "RANGE") {
        if (
          minVal.trim() === "" ||
          isNaN(Number(minVal)) ||
          maxVal.trim() === "" ||
          isNaN(Number(maxVal))
        ) {
          setErrorMsg("Please enter valid numeric minimum and maximum values.");
          return;
        }
        if (Number(minVal) > Number(maxVal)) {
          setErrorMsg("Range minimum value cannot be greater than maximum value.");
          return;
        }
      }
    }

    const payload: QuestionSavePayload = {
      id: initialQuestion?.id,
      paper_set_id: paperSetId,
      section_id: sectionId || null,
      group_id: groupId || null,
      type,
      text: text.trim(),
      marks: Number(marks),
      verification_status: verificationStatus,
      code_content:
        hasCode && codeContent.trim()
          ? { language: codeLanguage, content: codeContent.trim() }
          : null,
      image_assets: questionImages,
      options:
        type !== "NUMERICAL"
          ? options.filter((o) => o.text.trim().length > 0 || imageAssets(o.image_assets).length > 0).map((o, i) => ({ ...o, sequence: i + 1 }))
          : [],
      eval_numeric:
        type === "NUMERICAL"
          ? {
              mode: numMode,
              exact_val: numMode === "EXACT" ? Number(exactVal) : null,
              min_val: numMode === "RANGE" ? Number(minVal) : null,
              max_val: numMode === "RANGE" ? Number(maxVal) : null,
            }
          : null,
    };

    setIsSaving(true);
    try {
      const res = await onSave(payload);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to save question.");
      } else {
        const keep = new Set([questionImages, ...(payload.options || []).map((option) => imageAssets(option.image_assets))]
          .flat().flatMap((asset) => asset.storage_path ? [asset.storage_path] : []));
        await cleanupUploads(keep);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-950 rounded-t-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {initialQuestion ? "Edit Question" : "Create New Question"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {groupId ? "Inside Question Group" : "Direct Section Question"}
            </p>
          </div>
          <button
            onClick={() => void cancelEditor()}
            disabled={uploading || isSaving}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <fieldset disabled={uploading || isSaving} className="space-y-6 min-w-0">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Question Type and Marks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                Question Type
              </label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "MCQ" | "MSQ" | "NUMERICAL")
                }
                className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="MCQ">MCQ (Single Choice)</option>
                <option value="MSQ">MSQ (Multiple Choice)</option>
                <option value="NUMERICAL">Numerical (Exact or Range)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                Marks
              </label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                value={marks}
                onChange={(e) => setMarks(parseFloat(e.target.value) || 0)}
                className="h-10"
                required
              />
            </div>
          </div>

          <QuestionContentEditor label="Question" text={text} images={questionImages}
            onTextChange={setText} onImagesChange={setQuestionImages} paperId={paperSetId}
            onBusyChange={setUploading} onUploaded={trackUpload} />

          {/* MCQ / MSQ Options Editor */}
          {(type === "MCQ" || type === "MSQ") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Options & Answer Key
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {type === "MCQ"
                      ? "Select exactly one radio button for the correct option."
                      : "Check all boxes corresponding to correct options."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  className="text-xs"
                >
                  + Add Option
                </Button>
              </div>

              <div className="space-y-2.5">
                {options.map((option, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-wrap items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      option.is_correct
                        ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/50"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        key={`${type}_option_${idx}`}
                        type={type === "MCQ" ? "radio" : "checkbox"}
                        name={type === "MCQ" ? "mcq_correct_option" : `msq_correct_option_${idx}`}
                        checked={Boolean(option.is_correct)}
                        onChange={() => handleOptionCorrectToggle(idx)}
                        className="h-4 w-4 text-green-600 dark:text-green-400 focus:ring-green-500 cursor-pointer"
                        title={option.is_correct ? "Correct answer" : "Mark as correct"}
                      />
                      <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 w-5">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <QuestionContentEditor label={`Option ${String.fromCharCode(65 + idx)}`} text={option.text} images={option.image_assets}
                        onTextChange={(value) => handleOptionTextChange(idx, value)}
                        onImagesChange={(assets) => setOptions((prev) => prev.map((opt, i) => i === idx ? { ...opt, image_assets: assets } : opt))}
                        paperId={paperSetId} onBusyChange={setUploading} onUploaded={trackUpload} compact />
                    </div>
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-sm transition-colors"
                        title="Delete option"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Numerical Evaluation Editor */}
          {type === "NUMERICAL" && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-950/50 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
                  Numerical Evaluation Mode
                </label>
                <div className="flex space-x-6">
                  <label className="flex items-center space-x-2 text-sm text-slate-800 dark:text-slate-100 cursor-pointer">
                    <input
                      type="radio"
                      name="numMode"
                      value="EXACT"
                      checked={numMode === "EXACT"}
                      onChange={() => setNumMode("EXACT")}
                      className="text-blue-600 dark:text-blue-400"
                    />
                    <span>Exact Match</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm text-slate-800 dark:text-slate-100 cursor-pointer">
                    <input
                      type="radio"
                      name="numMode"
                      value="RANGE"
                      checked={numMode === "RANGE"}
                      onChange={() => setNumMode("RANGE")}
                      className="text-blue-600 dark:text-blue-400"
                    />
                    <span>Inclusive Range [Min, Max]</span>
                  </label>
                </div>
              </div>

              {numMode === "EXACT" ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Exact Correct Value *
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={exactVal}
                    onChange={(e) => setExactVal(e.target.value)}
                    placeholder="e.g. 3.1415"
                    className="h-10 max-w-xs bg-white dark:bg-slate-900"
                    required
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Student must enter this precise value to receive marks.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Minimum Value (Inclusive) *
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={minVal}
                      onChange={(e) => setMinVal(e.target.value)}
                      placeholder="e.g. 3.14"
                      className="h-10 bg-white dark:bg-slate-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Maximum Value (Inclusive) *
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={maxVal}
                      onChange={(e) => setMaxVal(e.target.value)}
                      placeholder="e.g. 3.15"
                      className="h-10 bg-white dark:bg-slate-900"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <details className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <summary className="cursor-pointer text-sm font-medium">More settings · code and review status</summary>
            <div className="mt-3 space-y-3">
          {/* Code Snippet Toggle */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-950/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Include Code Snippet
              </span>
              <button
                type="button"
                onClick={() => setHasCode(!hasCode)}
                className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                  hasCode
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                }`}
              >
                {hasCode ? "Enabled" : "Disabled"}
              </button>
            </div>

            {hasCode && (
              <div className="space-y-3 pt-2">
                <div className="w-48">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Language
                  </label>
                  <select
                    value={codeLanguage}
                    onChange={(e) => setCodeLanguage(e.target.value)}
                    className="w-full h-8 border border-slate-300 dark:border-slate-600 rounded text-xs px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                  >
                    {PROGRAMMING_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <textarea
                    value={codeContent}
                    onChange={(e) => setCodeContent(e.target.value)}
                    placeholder={"def solution():\n    return 42"}
                    rows={4}
                    className="w-full font-mono text-xs border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Verification Status */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                Verification Status:
              </span>
              <select
                value={verificationStatus}
                onChange={(e) =>
                  setVerificationStatus(
                    e.target.value as
                      | "Ready"
                      | "Needs Review"
                      | "Missing Image"
                      | "Code Needs Review"
                      | "Answer Needs Review"
                      | "Extraction Warning"
                  )
                }
                className="text-xs border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1 bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Ready">Ready (Verified)</option>
                <option value="Needs Review">Needs Review</option>
                <option value="Answer Needs Review">Answer Key Required</option>
                <option value="Missing Image">Missing Image</option>
                <option value="Code Needs Review">Code Needs Review</option>
                <option value="Extraction Warning">Extraction Warning</option>
              </select>
            </div>

            {verificationStatus !== "Ready" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setVerificationStatus("Ready")}
                className="text-xs text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 hover:bg-green-50 dark:hover:bg-green-900 border-green-300 dark:border-green-700 h-7"
              >
                ✓ Mark as Ready
              </Button>
            )}
          </div>

            </div>
          </details>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void cancelEditor()}
              disabled={isSaving || uploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              disabled={isSaving || uploading}
            >
              {isSaving
                ? "Saving Question..."
                : initialQuestion
                ? "Update Question"
                : "Create Question"}
            </Button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
