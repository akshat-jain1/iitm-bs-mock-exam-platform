"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/date";
import { importPaperFromPdfAction } from "./actions";

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface AssessmentType {
  id: string;
  name: string;
}

interface PaperSetOption {
  id: string;
  title: string;
  status: string;
  subject_id: string;
  assessment_type_id: string;
  subjects: { code: string; name: string };
  assessment_types: { name: string };
}

interface ImportJobSummary {
  id: string;
  paper_set_id: string;
  source_filename: string;
  file_size_bytes: number;
  status: string;
  extraction_metadata: unknown;
  error_message: string | null;
  created_at: string;
  paper_title: string;
}

interface PaperImportClientProps {
  subjects: Subject[];
  assessmentTypes: AssessmentType[];
  paperSets: PaperSetOption[];
  recentJobs: ImportJobSummary[];
  initialPaperId?: string;
}

export function PaperImportClient({
  subjects,
  assessmentTypes,
  paperSets,
  recentJobs,
  initialPaperId,
}: PaperImportClientProps) {
  const router = useRouter();

  // Mode: 'existing' vs 'new'
  const [importMode, setImportMode] = useState<"existing" | "new">(
    initialPaperId ? "existing" : paperSets.length > 0 ? "existing" : "new"
  );

  const [selectedPaperId, setSelectedPaperId] = useState(initialPaperId || paperSets[0]?.id || "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || "");
  const [assessmentTypeId, setAssessmentTypeId] = useState(assessmentTypes[0]?.id || "");
  const [paperTitle, setPaperTitle] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result state
  const [importResult, setImportResult] = useState<{
    paperSetId: string;
    jobId: string;
    summary: {
      total_questions: number;
      sections_created: number;
      needs_review_count: number;
    };
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setErrorMsg("Invalid file format. Please upload a valid .pdf document.");
      return;
    }
    if (file.size === 0) {
      setErrorMsg("The selected file is empty. Please upload a valid PDF document.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg("File size exceeds 20MB limit.");
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedFile) {
      setErrorMsg("Please select a PDF file to import.");
      return;
    }

    if (importMode === "new") {
      if (!paperTitle.trim()) {
        setErrorMsg("Paper Set Title is required.");
        return;
      }
    } else {
      if (!selectedPaperId) {
        setErrorMsg("Please select an existing Paper Set to import into.");
        return;
      }
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      if (importMode === "existing") {
        formData.append("paper_set_id", selectedPaperId);
      } else {
        formData.append("subject_id", subjectId);
        formData.append("assessment_type_id", assessmentTypeId);
        formData.append("title", paperTitle.trim());
      }

      const res = await importPaperFromPdfAction(formData);

      if (!res.success) {
        setErrorMsg(res.error || "Failed to process PDF.");
      } else if (res.paperSetId && res.jobId && res.summary) {
        setImportResult({
          paperSetId: res.paperSetId,
          jobId: res.jobId,
          summary: res.summary,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      if (
        msg.toLowerCase().includes("exceeded limit") ||
        msg.toLowerCase().includes("request entity too large") ||
        msg.includes("413")
      ) {
        setErrorMsg("Upload failed: The request payload exceeds the allowed size limit (maximum 20MB).");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Breadcrumbs */}
      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
        <Link href="/admin/question-bank" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          Paper Library
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-slate-50 font-semibold">Import from PDF</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
          PDF Question Paper Import & Extraction
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Upload an academic PDF question paper to automatically extract sections, question types, MCQ/MSQ options, and numerical parameters as an editable draft.
        </p>
      </div>

      {/* Main Import Card */}
      {!importResult ? (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-start space-x-2">
              <span className="font-bold">Error:</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
              Target Destination
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setImportMode("existing")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  importMode === "existing"
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                Import into Existing Paper Set
              </button>
              <button
                type="button"
                onClick={() => setImportMode("new")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                  importMode === "new"
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                Create New Paper Set
              </button>
            </div>
          </div>

          {/* Destination Form Fields */}
          {importMode === "existing" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                Select Existing Paper Set *
              </label>
              {paperSets.length > 0 ? (
                <>
                  <select
                    value={selectedPaperId}
                    onChange={(e) => setSelectedPaperId(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  >
                    {paperSets.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.subjects.code}] {p.title} ({p.assessment_types.name})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2 mt-2">
                    ℹ️ <strong>Append Mode:</strong> Imported sections, groups, and questions will be appended to this Paper Set. All existing sections and questions are fully preserved.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  No existing Paper Sets found. Please switch to &quot;Create New Paper Set&quot;.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Subject *
                  </label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Assessment Type *
                  </label>
                  <select
                    value={assessmentTypeId}
                    onChange={(e) => setAssessmentTypeId(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  >
                    {assessmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Paper Set Title / Name *
                </label>
                <Input
                  value={paperTitle}
                  onChange={(e) => setPaperTitle(e.target.value)}
                  placeholder="e.g. Quiz 1 - Set A"
                  required
                />
              </div>
            </div>
          )}

          {/* File Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
              Upload PDF File *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/50"
                  : selectedFile
                  ? "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-950/30"
                  : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-50/50 dark:bg-slate-950/50"
              }`}
            >
              <input
                type="file"
                id="pdf-upload-input"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="pdf-upload-input" className="cursor-pointer space-y-2 block">
                <div className="text-3xl">📄</div>
                {selectedFile ? (
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for extraction
                    </p>
                    <span className="inline-block mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      Click to choose a different file
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Click to browse or drag and drop your PDF here
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Maximum file size: 20MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Policy / Assistant Notice */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">🔒 Administrative Assistant Notice:</p>
            <p>
              PDF extraction acts as an authoring assistant. Extracted questions are stored as mutable drafts and must be reviewed, verified, and validated by an administrator before publication into the immutable snapshot graph.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px] h-10 shadow-sm"
            >
              {isUploading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Extracting Paper...</span>
                </div>
              ) : (
                "Upload & Extract Paper"
              )}
            </Button>
          </div>
        </form>
      ) : (
        /* Result Summary Card */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center font-bold text-xl">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">PDF Successfully Extracted!</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Job ID: {importResult.jobId} • Stored as editable draft templates
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg">
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Questions</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                {importResult.summary.total_questions}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg">
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Sections Created</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                {importResult.summary.sections_created}
              </p>
            </div>
            <div className={`p-4 border rounded-lg ${
              importResult.summary.needs_review_count > 0
                ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                : "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
            }`}>
              <span className="text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">Needing Review</span>
              <p className={`text-2xl font-bold mt-1 ${
                importResult.summary.needs_review_count > 0 ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300"
              }`}>
                {importResult.summary.needs_review_count}
              </p>
            </div>
          </div>

          {importResult.summary.needs_review_count > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold">⚠️ Mandatory Review Notice:</p>
              <p className="mt-1">
                {importResult.summary.needs_review_count} question(s) have unverified answer keys or require inspection before the paper can be published.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportResult(null);
                setSelectedFile(null);
              }}
              className="w-full sm:w-auto text-xs"
            >
              Import Another PDF
            </Button>

            <Button
              onClick={() => router.push(`/admin/question-bank/papers/${importResult.paperSetId}`)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm"
            >
              Open in Authoring Workspace to Review & Correct →
            </Button>
          </div>
        </div>
      )}

      {/* Recent Import Jobs History */}
      {recentJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            Recent PDF Import Jobs
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">Source File</th>
                  <th className="px-4 py-3">Paper Set</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {recentJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-50 flex items-center space-x-1.5">
                      <span>📄</span>
                      <span className="truncate max-w-xs">{job.source_filename}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium">
                      {job.paper_title}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          job.status === "Ready" || job.status === "Published"
                            ? "default"
                            : job.status === "Needs Review"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-[10px] uppercase font-mono"
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {formatDateTime(job.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/question-bank/papers/${job.paper_set_id}`}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-semibold"
                      >
                        Review Paper →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
