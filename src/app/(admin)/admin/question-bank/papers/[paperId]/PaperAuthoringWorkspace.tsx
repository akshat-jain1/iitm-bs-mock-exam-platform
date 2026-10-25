"use client";

import { QuestionImages } from "@/components/exam/QuestionImages";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { formatDateTime } from "@/lib/date";
import {
  UnifiedQuestionEditor,
  OptionState,
} from "@/components/admin/UnifiedQuestionEditor";
import {
  updatePaperTemplateAction,
  createSectionAction,
  deleteSectionAction,
  createGroupAction,
  deleteGroupAction,
  saveQuestionAction,
  deleteQuestionAction,
  validatePaperAction,
  publishPaperAction,
  updateQuestionVerificationStatusAction,
  QuestionSavePayload,
} from "@/app/(admin)/admin/question-bank/actions";
import { MathText } from "@/components/exam/MathText";
import { ReferenceData, ExtendedReferenceMaterial } from "@/components/exam/ReferenceData";

interface OptionData {
  id: string;
  question_id: string;
  text: string;
  sequence: number;
  image_assets?: unknown | null;
}

interface EvalMcqData {
  question_id: string;
  correct_option_id: string;
}

interface EvalNumData {
  question_id: string;
  mode: "EXACT" | "RANGE";
  exact_val: number | null;
  min_val: number | null;
  max_val: number | null;
}

interface QuestionData {
  id: string;
  section_id: string | null;
  group_id: string | null;
  type: "MCQ" | "MSQ" | "NUMERICAL";
  text: string;
  marks: number;
  verification_status:
    | "Ready"
    | "Needs Review"
    | "Missing Image"
    | "Code Needs Review"
    | "Answer Needs Review"
    | "Extraction Warning";
  source?: string | null;
  code_content: { language: string; content: string } | null;
  image_assets?: unknown | null;
  options: OptionData[];
  eval_mcq: EvalMcqData[];
  eval_numeric: EvalNumData | null;
}

interface GroupData {
  id: string;
  section_id: string;
  title: string | null;
  passage: string | null;
  code_content: { language: string; content: string } | null;
  image_assets?: unknown | null;
  questions: QuestionData[];
}

function QuestionImagePreview({ assets }: { assets?: unknown }) {
  return <div className="my-2"><QuestionImages assets={assets} admin /></div>;
}

interface ContentNodeData {
  id: string;
  section_id: string;
  node_type: "QUESTION" | "GROUP";
  question_id: string | null;
  group_id: string | null;
  sequence: number;
}

interface SectionData {
  id: string;
  paper_set_id: string;
  title: string;
  reference_material: unknown;
  questions: QuestionData[]; // Direct questions
  groups: GroupData[];
  content_nodes?: ContentNodeData[];
}

interface VersionData {
  id: string;
  title: string;
  created_at: string;
}

export interface PaperAuthoringWorkspaceProps {
  paper: {
    id: string;
    title: string;
    status: string;
    subject_id: string;
    assessment_type_id: string;
    reference_material: unknown;
    subjects: { id: string; name: string; code: string };
    assessment_types: { id: string; name: string };
  };
  sections: SectionData[];
  publishedVersions: VersionData[];
}

export function PaperAuthoringWorkspace({
  paper,
  sections,
  publishedVersions,
}: PaperAuthoringWorkspaceProps) {
  const router = useRouter();

  // State
  const [paperTitle, setPaperTitle] = useState(paper.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{
    type: "success" | "error";
    text: string;
    versionId?: string;
  } | null>(null);
  const [validationResult, setValidationResult] = useState<{
    tested: boolean;
    valid: boolean;
    message: string;
  } | null>(null);

  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{
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
  } | null>(null);

  // Group Modal State
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupSectionId, setGroupSectionId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPassage, setGroupPassage] = useState("");

  // Loading States
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Computed metrics
  const allQuestions = sections.flatMap((s) => [
    ...s.questions,
    ...s.groups.flatMap((g) => g.questions),
  ]);
  const totalQuestions = allQuestions.length;
  const totalMarks = allQuestions.reduce((sum, q) => sum + Number(q.marks), 0);
  const questionsNeedingReview = allQuestions.filter(
    (q) => q.verification_status !== "Ready"
  );

  // Handlers
  const handleSavePaperTitle = async () => {
    if (!paperTitle.trim()) return;
    const res = await updatePaperTemplateAction({
      id: paper.id,
      title: paperTitle.trim(),
    });
    if (res.success) {
      setIsEditingTitle(false);
      router.refresh();
    } else {
      alert(res.error || "Failed to update title");
    }
  };

  const handleAddSection = async () => {
    const nextNum = sections.length + 1;
    const res = await createSectionAction({
      paper_set_id: paper.id,
      title: `Section ${nextNum}`,
    });
    if (res.success) {
      router.refresh();
    } else {
      alert(res.error || "Failed to create section");
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (sections.length <= 1) {
      alert("A paper must have at least one section.");
      return;
    }
    if (confirm("Are you sure you want to delete this section? All questions in it will be removed.")) {
      const res = await deleteSectionAction({ id: sectionId, paper_set_id: paper.id });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete section");
      }
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupSectionId) return;

    const res = await createGroupAction({
      section_id: groupSectionId,
      paper_set_id: paper.id,
      title: groupTitle.trim() || "Question Group",
      passage: groupPassage.trim(),
    });

    if (res.success) {
      setGroupModalOpen(false);
      setGroupTitle("");
      setGroupPassage("");
      setGroupSectionId(null);
      router.refresh();
    } else {
      alert(res.error || "Failed to create group");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (confirm("Are you sure you want to delete this group? All questions inside it will be removed.")) {
      const res = await deleteGroupAction({ id: groupId, paper_set_id: paper.id });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete group");
      }
    }
  };

  const handleOpenAddQuestion = (sectionId: string, groupId?: string) => {
    setTargetSectionId(sectionId);
    setTargetGroupId(groupId || null);
    setEditingQuestion(null);
    setEditorOpen(true);
  };

  const handleOpenEditQuestion = (q: QuestionData) => {
    setTargetSectionId(q.section_id);
    setTargetGroupId(q.group_id);

    const optionsState: OptionState[] = (q.options || []).map((opt) => ({
      id: opt.id,
      text: opt.text,
      sequence: opt.sequence,
      is_correct: q.eval_mcq.some((e) => e.correct_option_id === opt.id),
      image_assets: opt.image_assets,
    }));

    setEditingQuestion({
      id: q.id,
      type: q.type,
      text: q.text,
      marks: q.marks,
      verification_status: q.verification_status,
      code_content: q.code_content,
      image_assets: q.image_assets,
      options: optionsState,
      eval_numeric: q.eval_numeric,
    });
    setEditorOpen(true);
  };

  const handleQuickMarkReady = async (questionId: string) => {
    try {
      const res = await updateQuestionVerificationStatusAction({
        id: questionId,
        paper_set_id: paper.id,
        verification_status: "Ready",
      });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to update status");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (confirm("Are you sure you want to delete this question?")) {
      const res = await deleteQuestionAction({ id: questionId, paper_set_id: paper.id });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete question");
      }
    }
  };

  const handleSaveQuestion = async (payload: QuestionSavePayload) => {
    const res = await saveQuestionAction(payload);
    if (res.success) {
      router.refresh();
    }
    return res;
  };

  const handleValidatePaper = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await validatePaperAction(paper.id);
      if (res.valid) {
        setValidationResult({
          tested: true,
          valid: true,
          message: "All validation checks passed! Paper is ready for publishing.",
        });
      } else {
        setValidationResult({
          tested: true,
          valid: false,
          message: res.error || "Validation checks failed.",
        });
      }
    } catch (err: unknown) {
      setValidationResult({
        tested: true,
        valid: false,
        message: err instanceof Error ? err.message : "Validation failed.",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handlePublishPaper = async () => {
    if (
      !confirm(
        "Are you sure you want to publish this paper?\n\nPublishing will take an immutable snapshot into 'paper_set_versions'. Any student exam attempts will use this frozen snapshot. Future changes to this template will not alter the published version."
      )
    ) {
      return;
    }

    setIsPublishing(true);
    setPublishMessage(null);
    try {
      const res = await publishPaperAction(paper.id);
      if (res.success) {
        setPublishMessage({
          type: "success",
          text: `Paper published successfully! Immutable version created.`,
          versionId: res.versionId,
        });
        router.refresh();
      } else {
        setPublishMessage({
          type: "error",
          text: res.error || "Failed to publish paper.",
        });
      }
    } catch (err: unknown) {
      setPublishMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Publishing error.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
            <Link href="/admin/question-bank" className="hover:underline text-blue-600 dark:text-blue-400">
              Question Bank
            </Link>
            <span>/</span>
            <span>Paper Set</span>
          </div>

          <div className="flex items-center space-x-3">
            {isEditingTitle ? (
              <div className="flex items-center space-x-2">
                <Input
                  value={paperTitle}
                  onChange={(e) => setPaperTitle(e.target.value)}
                  className="text-xl font-bold h-9 w-72"
                  autoFocus
                />
                <Button size="sm" onClick={handleSavePaperTitle} className="bg-blue-600 text-white">
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditingTitle(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{paperTitle}</h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                  title="Rename Paper Set"
                >
                  ✏️
                </button>
              </div>
            )}
            <Badge variant="secondary" className="font-mono text-xs">
              {paper.subjects.code}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              {paper.assessment_types.name}
            </Badge>
            <Badge
              variant={paper.status === "Ready" ? "default" : "secondary"}
              className="text-[10px] uppercase tracking-wider"
            >
              {paper.status}
            </Badge>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-3">
          <Link href={`/admin/question-bank/import?paperId=${paper.id}`}>
            <Button
              variant="outline"
              className="text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900 bg-white dark:bg-slate-900 shadow-sm"
            >
              📄 Import from PDF
            </Button>
          </Link>

          <Button
            variant="outline"
            onClick={handleValidatePaper}
            disabled={isValidating}
            className="text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900"
          >
            {isValidating ? "Validating..." : "🔍 Validate Paper"}
          </Button>

          <Button
            onClick={handlePublishPaper}
            disabled={isPublishing}
            className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
          >
            {isPublishing ? "Publishing..." : "🚀 Publish Snapshot"}
          </Button>

          <Button
            onClick={handleAddSection}
            variant="outline"
            className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900"
          >
            + Add Section
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Subject</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-0.5">{paper.subjects.name}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Assessment Type</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-0.5">{paper.assessment_types.name}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total Questions</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-0.5">{totalQuestions}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total Marks</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 mt-0.5">{totalMarks.toFixed(2)}</p>
        </div>
      </div>

      {/* Questions Needing Review Alert */}
      {questionsNeedingReview.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start space-x-3 text-amber-900 dark:text-amber-200 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="text-sm font-bold">
              {questionsNeedingReview.length} Question{questionsNeedingReview.length > 1 ? "s" : ""} Require Review Before Publication
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
              Questions flagged with &quot;Answer Key Required&quot;, &quot;Missing Image&quot;, &quot;Code Needs Review&quot;, or &quot;Extraction Warning&quot; cannot be published. Click &quot;Edit&quot; to review, verify answer keys, or mark them as &quot;Ready&quot;.
            </p>
          </div>
        </div>
      )}

      {/* Validation Result Banner */}
      {validationResult && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-start justify-between ${
            validationResult.valid
              ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
          }`}
        >
          <div className="flex items-center space-x-2">
            <span>{validationResult.valid ? "✅" : "⚠️"}</span>
            <span className="font-medium">{validationResult.message}</span>
          </div>
          <button
            onClick={() => setValidationResult(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Publish Message Banner */}
      {publishMessage && (
        <div
          className={`p-4 rounded-lg border text-sm space-y-1 ${
            publishMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="font-semibold">{publishMessage.text}</p>
            <button
              onClick={() => setPublishMessage(null)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
          {publishMessage.versionId && (
            <p className="text-xs font-mono bg-white/60 dark:bg-slate-900/60 p-1.5 rounded border border-emerald-200 dark:border-emerald-800 inline-block">
              Immutable Version ID: {publishMessage.versionId}
            </p>
          )}
        </div>
      )}

      {/* Published Version Snapshots History */}
      {publishedVersions && publishedVersions.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Immutable Version History ({publishedVersions.length})
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Exam attempts link directly to these versions.
            </span>
          </div>
          <div className="space-y-1.5">
            {publishedVersions.map((ver, idx) => (
              <div
                key={ver.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-700 gap-1.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Snapshot #{publishedVersions.length - idx}</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] break-all sm:break-normal">{ver.id}</span>
                </div>
                <span className="text-slate-400 text-[11px] shrink-0">
                  {formatDateTime(ver.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paper-level Useful Data / Reference Material */}
      {paper.reference_material ? (
        <div className="mb-6">
          <ReferenceData data={paper.reference_material as ExtendedReferenceMaterial} />
        </div>
      ) : null}

      {/* Sections Workspace */}
      <div className="space-y-6">
        {sections.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center space-y-3">
            <span className="text-4xl">📑</span>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">No Sections in this Paper Set</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Get started by adding your first section manually, or import questions directly from a PDF.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" onClick={handleAddSection} className="bg-blue-600 hover:bg-blue-700 text-white">
                + Add Section
              </Button>
              <Link href={`/admin/question-bank/import?paperId=${paper.id}`}>
                <Button size="sm" variant="outline" className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900">
                  📄 Import from PDF
                </Button>
              </Link>
            </div>
          </div>
        )}

        {sections.map((section, sIdx) => {
          const sectionQuestions = [
            ...section.questions,
            ...section.groups.flatMap((g) => g.questions),
          ];

          return (
            <div
              key={section.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
            >
              {/* Section Header */}
              <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex items-center space-x-3">
                  <span className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center">
                    {sIdx + 1}
                  </span>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{section.title}</h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({sectionQuestions.length} question{sectionQuestions.length !== 1 ? "s" : ""})
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenAddQuestion(section.id)}
                    className="text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm"
                  >
                    + Add Question
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setGroupSectionId(section.id);
                      setGroupModalOpen(true);
                    }}
                    className="text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm"
                  >
                    + Add Group
                  </Button>

                  {sections.length > 1 && (
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-xs"
                      title="Delete section"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              {/* Section Body */}
              <div className="p-6 space-y-6">
                {section.reference_material ? (
                  <ReferenceData data={section.reference_material as ExtendedReferenceMaterial} />
                ) : null}

                {section.questions.length === 0 && section.groups.length === 0 && (
                  <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">This section has no questions yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Click &quot;+ Add Question&quot; above to create one.</p>
                  </div>
                )}

                {/* If section content nodes exist, render in exact interleaved document sequence */}
                {section.content_nodes && section.content_nodes.length > 0 ? (
                  <>
                    {section.content_nodes.map((node, nIdx) => {
                      if (node.node_type === "QUESTION") {
                        const q = section.questions.find((x) => x.id === node.question_id);
                        if (!q) return null;
                        return (
                          <QuestionCard
                            key={q.id}
                            question={q}
                            index={nIdx + 1}
                            onEdit={() => handleOpenEditQuestion(q)}
                            onDelete={() => handleDeleteQuestion(q.id)}
                            onMarkReady={() => handleQuickMarkReady(q.id)}
                          />
                        );
                      } else if (node.node_type === "GROUP") {
                        const group = section.groups.find((g) => g.id === node.group_id);
                        if (!group) return null;
                        return (
                          <div
                            key={group.id}
                            className="border-2 border-blue-100 dark:border-blue-900 rounded-xl p-5 bg-blue-50/20 dark:bg-blue-950/20 space-y-4"
                          >
                            <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900 pb-3">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs uppercase tracking-wider font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">
                                    Question Group
                                  </span>
                                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                                    {group.title || "Comprehension / Case Study"}
                                  </h3>
                                </div>
                                {group.passage && (
                                  <div className="mt-2 text-xs text-slate-700 dark:text-slate-200 italic">
                                    <MathText text={group.passage} />
                                  </div>
                                )}
                                <QuestionImagePreview assets={group.image_assets} />
                              </div>

                              <div className="flex items-center space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenAddQuestion(section.id, group.id)}
                                  className="text-xs bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 shadow-sm"
                                >
                                  + Add Question to Group
                                </Button>
                                <button
                                  onClick={() => handleDeleteGroup(group.id)}
                                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-xs"
                                  title="Delete group"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {/* Questions inside Group */}
                            <div className="space-y-3 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                              {group.questions.length === 0 && (
                                <p className="text-xs text-slate-400 italic py-2">
                                  No questions in this group yet.
                                </p>
                              )}
                              {group.questions.map((gq, gqIdx) => (
                                <QuestionCard
                                  key={gq.id}
                                  question={gq}
                                  index={gqIdx + 1}
                                  onEdit={() => handleOpenEditQuestion(gq)}
                                  onDelete={() => handleDeleteQuestion(gq.id)}
                                  onMarkReady={() => handleQuickMarkReady(gq.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}

                    {/* Any questions or groups not in content nodes */}
                    {section.questions
                      .filter((q) => !section.content_nodes?.some((cn) => cn.question_id === q.id))
                      .map((q, qIdx) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          index={(section.content_nodes?.length || 0) + qIdx + 1}
                          onEdit={() => handleOpenEditQuestion(q)}
                          onDelete={() => handleDeleteQuestion(q.id)}
                          onMarkReady={() => handleQuickMarkReady(q.id)}
                        />
                      ))}
                    {section.groups
                      .filter((g) => !section.content_nodes?.some((cn) => cn.group_id === g.id))
                      .map((group) => (
                        <div
                          key={group.id}
                          className="border-2 border-blue-100 dark:border-blue-900 rounded-xl p-5 bg-blue-50/20 dark:bg-blue-950/20 space-y-4"
                        >
                          <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900 pb-3">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                              {group.title || "Comprehension / Case Study"}
                            </h3>
                          </div>
                          {group.passage && (
                            <div className="mt-2 text-xs text-slate-700 dark:text-slate-200 italic">
                              <MathText text={group.passage} />
                            </div>
                          )}
                          {group.code_content && (
                            <div className="my-2 space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                <span>Code snippet ({group.code_content.language}):</span>
                              </div>
                              <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-md overflow-x-auto whitespace-pre">
                                <code>{group.code_content.content}</code>
                              </pre>
                            </div>
                          )}
                          <QuestionImagePreview assets={group.image_assets} />
                          <div className="space-y-3 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                            {group.questions.map((gq, gqIdx) => (
                              <QuestionCard
                                key={gq.id}
                                question={gq}
                                index={gqIdx + 1}
                                onEdit={() => handleOpenEditQuestion(gq)}
                                onDelete={() => handleDeleteQuestion(gq.id)}
                                onMarkReady={() => handleQuickMarkReady(gq.id)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                  </>
                ) : (
                  <>
                    {/* Direct Questions in Section */}
                    {section.questions.map((q, qIdx) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        index={qIdx + 1}
                        onEdit={() => handleOpenEditQuestion(q)}
                        onDelete={() => handleDeleteQuestion(q.id)}
                        onMarkReady={() => handleQuickMarkReady(q.id)}
                      />
                    ))}

                    {/* Groups in Section */}
                    {section.groups.map((group) => (
                      <div
                        key={group.id}
                        className="border-2 border-blue-100 dark:border-blue-900 rounded-xl p-5 bg-blue-50/20 dark:bg-blue-950/20 space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900 pb-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs uppercase tracking-wider font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">
                                Question Group
                              </span>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                                {group.title || "Comprehension / Case Study"}
                              </h3>
                            </div>
                            {group.passage && (
                              <div className="mt-2 text-xs text-slate-700 dark:text-slate-200 italic">
                                <MathText text={group.passage} />
                              </div>
                            )}
                            {group.code_content && (
                              <div className="my-2 space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                  <span>Code snippet ({group.code_content.language}):</span>
                                </div>
                                <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-md overflow-x-auto whitespace-pre">
                                  <code>{group.code_content.content}</code>
                                </pre>
                              </div>
                            )}
                            <QuestionImagePreview assets={group.image_assets} />
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAddQuestion(section.id, group.id)}
                              className="text-xs bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 shadow-sm"
                            >
                              + Add Question to Group
                            </Button>
                            <button
                              onClick={() => handleDeleteGroup(group.id)}
                              className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-xs"
                              title="Delete group"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Questions inside Group */}
                        <div className="space-y-3 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                          {group.questions.length === 0 && (
                            <p className="text-xs text-slate-400 italic py-2">
                              No questions in this group yet.
                            </p>
                          )}
                          {group.questions.map((gq, gqIdx) => (
                            <QuestionCard
                              key={gq.id}
                              question={gq}
                              index={gqIdx + 1}
                              onEdit={() => handleOpenEditQuestion(gq)}
                              onDelete={() => handleDeleteQuestion(gq.id)}
                              onMarkReady={() => handleQuickMarkReady(gq.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified Question Editor Modal */}
      {editorOpen && (
        <UnifiedQuestionEditor
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveQuestion}
          paperSetId={paper.id}
          sectionId={targetSectionId}
          groupId={targetGroupId}
          initialQuestion={editingQuestion}
        />
      )}

      {/* Question Group Modal */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Add Question Group / Passage</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                  Group Title
                </label>
                <Input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="e.g. Case Study 1: Probability"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                  Common Passage / Context Text
                </label>
                <textarea
                  value={groupPassage}
                  onChange={(e) => setGroupPassage(e.target.value)}
                  placeholder="Enter the common passage or prompt that applies to all questions in this group..."
                  rows={5}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-md p-2.5 text-sm text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGroupModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 text-white">
                  Create Group
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------
// QUESTION DISPLAY CARD
// ------------------------------------------------------------------------------

interface QuestionCardProps {
  question: QuestionData;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onMarkReady: () => void;
}

function QuestionCard({ question, index, onEdit, onDelete, onMarkReady }: QuestionCardProps) {
  const sourceMatch = question.source?.match(/\bQ(\d+)\b/i);
  const displayQNum = sourceMatch ? `Q${sourceMatch[1]}` : `Q${index}`;

  const hasEmptyOptions =
    (question.type === "MCQ" || question.type === "MSQ") &&
    question.options.some((opt) => (!opt.text || opt.text.trim() === "") && !opt.image_assets);

  const isExtractionWarning = question.verification_status === "Extraction Warning";

  const displayStatusLabel =
    question.verification_status === "Answer Needs Review"
      ? "Answer Key Required"
      : question.verification_status;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors space-y-3">
      {/* Top line: Question Type, Marks, Verification Badge, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            {displayQNum}
          </span>
          <Badge
            variant={
              question.type === "MCQ"
                ? "default"
                : question.type === "MSQ"
                ? "secondary"
                : "outline"
            }
            className="text-[10px] uppercase font-mono"
          >
            {question.type}
          </Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {question.marks} mark{Number(question.marks) !== 1 ? "s" : ""}
          </span>

          {/* Verification Status Badge */}
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              question.verification_status === "Ready"
                ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                : question.verification_status === "Answer Needs Review"
                ? "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                : question.verification_status === "Missing Image"
                ? "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700 font-bold"
                : question.verification_status === "Code Needs Review"
                ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 font-bold"
            }`}
            title={
              question.verification_status === "Answer Needs Review"
                ? "Extraction succeeded. Answer key required before publishing."
                : question.verification_status === "Extraction Warning"
                ? "Content or options could not be fully extracted from text (e.g. visual symbols or stress patterns)."
                : undefined
            }
          >
            {question.verification_status === "Ready" && "✓ "}
            {displayStatusLabel}
          </span>

          {question.source?.startsWith("PDF Import") && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded font-mono">
                {question.source}
              </span>
              {(question.eval_mcq.length > 0 || question.eval_numeric) && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                  <span>✓</span> PDF Answer Key
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {question.verification_status !== "Ready" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onMarkReady}
              className="text-xs h-7 px-2 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900 border-green-300 dark:border-green-700"
              title="Mark as Ready after admin review"
            >
              Mark Ready
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit} className="text-xs h-7 px-2.5">
            Edit
          </Button>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-xs transition-colors"
            title="Delete Question"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Visual / Missing Options Warning Banner */}
      {(hasEmptyOptions || isExtractionWarning) && (
        <div className="p-3 bg-amber-50/90 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2">
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-bold">Extraction Warning: Missing Visual Content</p>
            <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-200">
              Option content contains visual symbols, stress patterns, or diagrams that cannot be recovered from plain text extraction. Refer to the source PDF to verify and complete the options before marking as Ready.
            </p>
          </div>
        </div>
      )}

      {/* Question Text */}
      <MathText
        text={question.text}
        className="text-sm text-slate-900 dark:text-slate-50 leading-relaxed font-medium whitespace-pre-wrap"
      />

      {/* Question Attached Diagram/Images */}
      <QuestionImagePreview assets={question.image_assets} />

      {/* Code Snippet (if any) */}
      {question.code_content && (
        <div className="my-2 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Code snippet ({question.code_content.language}):</span>
          </div>
          <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-md overflow-x-auto whitespace-pre">
            <code>{question.code_content.content}</code>
          </pre>
        </div>
      )}

      {/* MCQ / MSQ Options Display */}
      {(question.type === "MCQ" || question.type === "MSQ") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {question.options.map((opt, oIdx) => {
            const isCorrect = question.eval_mcq.some((e) => e.correct_option_id === opt.id);
            const hasImage = Boolean(
              opt.image_assets &&
                (Array.isArray(opt.image_assets)
                  ? (opt.image_assets as unknown[]).length > 0
                  : true)
            );
            const isReferToImage = Boolean(opt.text && /refer to option image/i.test(opt.text.trim()));
            const isTextEmpty = !opt.text || opt.text.trim() === "" || isReferToImage;
            const isTrulyMissing = isTextEmpty && !hasImage;
            const isVisualOnly = isTextEmpty && hasImage;

            return (
              <div
                key={opt.id}
                className={`text-xs p-2.5 rounded-lg border flex flex-col justify-between space-y-1.5 transition-colors ${
                  isCorrect
                    ? "bg-green-50/80 dark:bg-green-950/80 border-green-300 dark:border-green-700 font-semibold text-green-900 dark:text-green-200"
                    : isTrulyMissing
                    ? "bg-amber-50/60 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                    : "bg-slate-50/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                      {String.fromCharCode(65 + oIdx)}.
                    </span>
                    {isVisualOnly && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium">
                        🖼️ Visual Option
                      </span>
                    )}
                  </div>
                  {isCorrect && (
                    <span className="text-green-700 dark:text-green-300 font-bold text-xs bg-green-100/80 dark:bg-green-900/80 px-1.5 py-0.5 rounded flex items-center gap-1" title="Correct Answer">
                      <span>✓</span> Correct Key
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  {opt.text && !isReferToImage && opt.text !== "[Image]" ? (
                    <MathText text={opt.text} className="text-slate-800 dark:text-slate-100 text-xs leading-relaxed" />
                  ) : null}
                  {isTrulyMissing && (
                    <span className="italic text-amber-800 dark:text-amber-200 font-mono text-[11px] bg-amber-100/70 dark:bg-amber-900/70 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700 block">
                      ⚠️ [Missing Option Content]
                    </span>
                  )}
                  {hasImage ? (
                    <div className="pt-1">
                      <QuestionImagePreview assets={opt.image_assets} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Numerical Answer Display */}
      {question.type === "NUMERICAL" && question.eval_numeric && (
        <div className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-2.5 rounded-md text-slate-700 dark:text-slate-200 flex items-center space-x-2">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {question.eval_numeric.mode === "EXACT" ? "Exact Value:" : "Range:"}
          </span>
          <span className="font-mono">
            {question.eval_numeric.mode === "EXACT"
              ? question.eval_numeric.exact_val
              : `[${question.eval_numeric.min_val}, ${question.eval_numeric.max_val}]`}
          </span>
        </div>
      )}
    </div>
  );
}
