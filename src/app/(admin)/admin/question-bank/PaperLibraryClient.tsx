"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/date";
import {
  createPaperTemplateAction,
  deletePaperTemplateAction,
} from "./actions";

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface AssessmentType {
  id: string;
  name: string;
}

export interface PaperSetSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  subject_id: string;
  assessment_type_id: string;
  subjects: Subject;
  assessment_types: AssessmentType;
  section_count: number;
  question_count: number;
}

interface PaperLibraryClientProps {
  paperSets: PaperSetSummary[];
  subjects: Subject[];
  assessmentTypes: AssessmentType[];
}

export function PaperLibraryClient({
  paperSets,
  subjects,
  assessmentTypes,
}: PaperLibraryClientProps) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubjectId, setNewSubjectId] = useState(subjects[0]?.id || "");
  const [newTypeId, setNewTypeId] = useState(assessmentTypes[0]?.id || "");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Filtered Paper Sets
  const filteredSets = paperSets.filter((paper) => {
    const matchesSearch = paper.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      paper.subjects.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      paper.subjects.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSubject = selectedSubject === "all" || paper.subject_id === selectedSubject;
    const matchesType = selectedType === "all" || paper.assessment_type_id === selectedType;
    const matchesStatus = selectedStatus === "all" || paper.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesSubject && matchesType && matchesStatus;
  });

  const handleCreatePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newTitle.trim()) {
      setCreateError("Set name / title is required.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await createPaperTemplateAction({
        subject_id: newSubjectId,
        assessment_type_id: newTypeId,
        title: newTitle.trim(),
      });

      if (!res.success) {
        setCreateError(res.error || "Failed to create paper set.");
      } else {
        setCreateModalOpen(false);
        setNewTitle("");
        router.push(`/admin/question-bank/papers/${res.paperId}`);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Error creating paper set.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePaper = async (paperId: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      const res = await deletePaperTemplateAction(paperId);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete paper set.");
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Paper Library & Question Bank</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Author and manage draft paper sets, configure sections, and publish immutable versions for student exams.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/admin/question-bank/import"
            className="inline-flex items-center justify-center rounded-md font-semibold text-sm h-10 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors cursor-pointer"
          >
            <span className="mr-1.5 text-base">📄</span> Import from PDF
          </Link>
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold"
          >
            + Create Paper Set
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search by title or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full"
            />
          </div>

          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="h-9 w-full sm:w-auto border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-9 w-full sm:w-auto border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Assessment Types</option>
            {assessmentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 w-full sm:w-auto border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
          </select>
        </div>

        <Link
          href="/admin/question-bank/import"
          className="inline-flex items-center justify-center text-xs font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200 bg-purple-50 dark:bg-purple-950 hover:bg-purple-100 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800 px-3 py-2 rounded-lg transition-colors shrink-0 shadow-xs"
        >
          📄 Import from PDF →
        </Link>
      </div>

      {/* Paper Sets Table */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-xl">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider min-w-[200px]">
                  Paper Set Title
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Subject
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Assessment Type
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Content Structure
                </th>
                <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                  Actions
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {filteredSets.map((paper) => (
              <tr key={paper.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{paper.title}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {paper.id}</div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{paper.subjects.name}</div>
                  <Badge variant="secondary" className="font-mono text-[10px] mt-0.5">
                    {paper.subjects.code}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Badge variant="outline" className="font-mono text-xs">
                    {paper.assessment_types.name}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Badge
                    variant={paper.status === "Ready" ? "default" : "secondary"}
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {paper.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    {paper.section_count} section{paper.section_count !== 1 ? "s" : ""} •{" "}
                    {paper.question_count} question{paper.question_count !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Updated {formatDate(paper.updated_at)}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium space-x-3">
                  <Link
                    href={`/admin/question-bank/papers/${paper.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 font-semibold"
                  >
                    Author / Edit →
                  </Link>
                  <button
                    onClick={() => handleDeletePaper(paper.id, paper.title)}
                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 text-xs transition-colors"
                    title="Delete Paper Set"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}

            {filteredSets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-3xl">📄</span>
                    <p className="font-medium text-slate-700 dark:text-slate-200">No paper sets found.</p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Create your first paper set above or import directly from an existing PDF question paper.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <Link
                        href="/admin/question-bank/import"
                        className="inline-flex items-center justify-center rounded-md font-semibold text-xs h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
                      >
                        📄 Import from PDF
                      </Link>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create Paper Set Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Create New Paper Set</h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreatePaper} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Subject *
                </label>
                <select
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
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
                  value={newTypeId}
                  onChange={(e) => setNewTypeId(e.target.value)}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {assessmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Paper Set Name / Label *
                </label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Set A or Midterm 2026 Set 1"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">
                  Unique within this Subject + Assessment Type.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create & Start Authoring"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
