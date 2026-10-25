"use client";

import React, { useState, useTransition } from "react";
import {
  FeedbackCategory,
  FeedbackStatus,
  FeedbackOutcome,
  StudentFeedbackItem,
  FeedbackStatusHistoryItem,
  FeedbackInternalNoteItem,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_OUTCOMES,
  FEEDBACK_CATEGORY_METADATA,
  FEEDBACK_STATUS_METADATA,
  FEEDBACK_OUTCOME_METADATA,
  AdminFeedbackFilters,
} from "@/lib/feedback/types";
import {
  getAdminFeedbackListAction,
  getAdminFeedbackDetailAction,
  updateAdminFeedbackStatusAction,
  addAdminInternalNoteAction,
  AdminFeedbackListResult,
} from "./actions";
import { Button } from "@/components/ui/Button";

interface AdminFeedbackClientProps {
  initialData: AdminFeedbackListResult;
}

export function AdminFeedbackClient({ initialData }: AdminFeedbackClientProps) {
  const [data, setData] = useState<AdminFeedbackListResult>(initialData);
  const [filters, setFilters] = useState<AdminFeedbackFilters>({
    status: "all",
    category: "all",
    searchQuery: "",
    page: 1,
    pageSize: 20,
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const [isPending, startTransition] = useTransition();

  // Detail Drawer State
  const [activeItem, setActiveItem] = useState<StudentFeedbackItem | null>(null);
  const [history, setHistory] = useState<FeedbackStatusHistoryItem[]>([]);
  const [internalNotes, setInternalNotes] = useState<FeedbackInternalNoteItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Update Form State
  const [updateStatus, setUpdateStatus] = useState<FeedbackStatus>("under_review");
  const [updateOutcome, setUpdateOutcome] = useState<FeedbackOutcome>("implemented");
  const [updateResolutionNote, setUpdateResolutionNote] = useState("");
  const [updateStudentMessage, setUpdateStudentMessage] = useState("");
  const [updateInternalNote, setUpdateInternalNote] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // Standalone Internal Note State
  const [standaloneNote, setStandaloneNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const fetchFilteredData = (newFilters: AdminFeedbackFilters) => {
    startTransition(async () => {
      const res = await getAdminFeedbackListAction(newFilters);
      setData(res);
      setFilters(newFilters);
    });
  };

  const handleOpenDetail = async (item: StudentFeedbackItem) => {
    setActiveItem(item);
    setUpdateStatus(item.status);
    setUpdateOutcome(item.resolution_outcome || "implemented");
    setUpdateResolutionNote(item.resolution_note || "");
    setUpdateStudentMessage("");
    setUpdateInternalNote("");
    setUpdateError(null);
    setUpdateSuccess(null);
    setStandaloneNote("");
    setNoteError(null);

    setDetailLoading(true);
    try {
      const detail = await getAdminFeedbackDetailAction(item.id);
      if (detail.feedback) {
        setActiveItem(detail.feedback);
      }
      setHistory(detail.history);
      setInternalNotes(detail.internalNotes);
    } catch (err) {
      console.error("Error loading feedback details:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    setUpdateError(null);
    setUpdateSuccess(null);

    startTransition(async () => {
      const res = await updateAdminFeedbackStatusAction({
        feedback_id: activeItem.id,
        new_status: updateStatus,
        outcome: updateStatus === "closed" ? updateOutcome : null,
        resolution_note: updateResolutionNote || null,
        student_message: updateStudentMessage || null,
        internal_note: updateInternalNote || null,
      });

      if (!res.success) {
        setUpdateError(res.error || "Failed to update feedback status.");
        return;
      }

      setUpdateSuccess("Feedback status and audit history updated successfully.");

      // Refresh detail view
      const detail = await getAdminFeedbackDetailAction(activeItem.id);
      if (detail.feedback) {
        setActiveItem(detail.feedback);
      }
      setHistory(detail.history);
      setInternalNotes(detail.internalNotes);

      // Refresh list view in background
      const listRes = await getAdminFeedbackListAction(filters);
      setData(listRes);
    });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !standaloneNote.trim()) return;

    setNoteError(null);
    startTransition(async () => {
      const res = await addAdminInternalNoteAction(activeItem.id, standaloneNote);
      if (!res.success) {
        setNoteError(res.error || "Failed to add note.");
        return;
      }

      setStandaloneNote("");
      const detail = await getAdminFeedbackDetailAction(activeItem.id);
      setInternalNotes(detail.internalNotes);
    });
  };

  const stats = data.stats;

  return (
    <div className="font-sans space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
            Feedback & Triage Inbox
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review student feature requests, resolve bug reports, and track question corrections.
          </p>
        </div>
      </div>

      {/* Workflow Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => fetchFilteredData({ ...filters, status: "all", page: 1 })}
          className={`cursor-pointer p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-xs ${
            filters.status === "all" ? "ring-2 ring-blue-600 border-blue-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{stats.totalCount}</p>
        </div>
        <div
          onClick={() => fetchFilteredData({ ...filters, status: "new", page: 1 })}
          className={`cursor-pointer p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-xs ${
            filters.status === "new" ? "ring-2 ring-blue-600 border-blue-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
          }`}
        >
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">New</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.newCount}</p>
        </div>
        <div
          onClick={() => fetchFilteredData({ ...filters, status: "under_review", page: 1 })}
          className={`cursor-pointer p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-xs ${
            filters.status === "under_review" ? "ring-2 ring-blue-600 border-blue-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
          }`}
        >
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Under Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.underReviewCount}</p>
        </div>
        <div
          onClick={() => fetchFilteredData({ ...filters, status: "in_progress", page: 1 })}
          className={`cursor-pointer p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-xs ${
            filters.status === "in_progress" ? "ring-2 ring-blue-600 border-blue-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
          }`}
        >
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">In Progress</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-300">{stats.inProgressCount}</p>
        </div>
        <div
          onClick={() => fetchFilteredData({ ...filters, status: "closed", page: 1 })}
          className={`cursor-pointer p-4 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-xs ${
            filters.status === "closed" ? "ring-2 ring-blue-600 border-blue-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closed</p>
          <p className="mt-1 text-2xl font-bold text-slate-700 dark:text-slate-200">{stats.closedCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <select
            value={filters.category || "all"}
            onChange={(e) =>
              fetchFilteredData({ ...filters, category: e.target.value as FeedbackCategory | "all", page: 1 })
            }
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FEEDBACK_CATEGORY_METADATA[c].label}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={`${filters.sortBy}_${filters.sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split("_");
              fetchFilteredData({ ...filters, sortBy: sb as "created_at" | "updated_at", sortOrder: so as "asc" | "desc", page: 1 });
            }}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="created_at_desc">Newest Submissions</option>
            <option value="created_at_asc">Oldest Submissions</option>
            <option value="updated_at_desc">Recently Updated</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72">
          <input
            type="text"
            value={filters.searchQuery || ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                fetchFilteredData({ ...filters, page: 1 });
              }
            }}
            placeholder="Search titles or descriptions..."
            className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        {data.items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No feedback items match your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try broadening your search query or status filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Submitter & Category</th>
                  <th className="px-6 py-3.5">Feedback Summary</th>
                  <th className="px-6 py-3.5">Context</th>
                  <th className="px-6 py-3.5">Status & Outcome</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {data.items.map((item) => {
                  const catMeta = FEEDBACK_CATEGORY_METADATA[item.category] || FEEDBACK_CATEGORY_METADATA.general;
                  const statusMeta = FEEDBACK_STATUS_METADATA[item.status] || FEEDBACK_STATUS_METADATA.new;
                  const outcomeMeta = item.resolution_outcome ? FEEDBACK_OUTCOME_METADATA[item.resolution_outcome] : null;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-50">{item.user?.name || "Student"}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.user?.email || item.user_id}</div>
                        <div className="mt-1">
                          <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium border ${catMeta.badgeClass}`}>
                            {catMeta.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-sm">
                        <div className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-1">{item.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{item.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {item.subject && <div>Subject: {item.subject.code}</div>}
                        {item.assessment && <div>Exam: {item.assessment.title}</div>}
                        {item.question_reference && <div className="text-slate-500 dark:text-slate-400">Q: {item.question_reference}</div>}
                        {!item.subject && !item.assessment && !item.question_reference && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                          {outcomeMeta && (
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${outcomeMeta.badgeClass}`}>
                              {outcomeMeta.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(item)}
                          className="text-xs"
                        >
                          Triage & Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {data.total > data.pageSize && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
            <div>
              Showing {(data.page - 1) * data.pageSize + 1} to{" "}
              {Math.min(data.page * data.pageSize, data.total)} of {data.total} items
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || isPending}
                onClick={() => fetchFilteredData({ ...filters, page: data.page - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page * data.pageSize >= data.total || isPending}
                onClick={() => fetchFilteredData({ ...filters, page: data.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Slide-Over / Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/70">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${FEEDBACK_CATEGORY_METADATA[activeItem.category]?.badgeClass || ""}`}>
                    {FEEDBACK_CATEGORY_METADATA[activeItem.category]?.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    ID: {activeItem.id.slice(0, 8)}...
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">{activeItem.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Submitted by <span className="font-semibold text-slate-700 dark:text-slate-200">{activeItem.user?.name || "Student"}</span> ({activeItem.user?.email}) on {new Date(activeItem.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Full Description & Context */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Submission Details
                </h3>
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap border border-slate-200 dark:border-slate-700 leading-relaxed">
                  {activeItem.description}
                </div>
                {(activeItem.subject || activeItem.assessment || activeItem.question_reference || activeItem.page_url) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {activeItem.subject && (
                      <span className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">
                        Subject: {activeItem.subject.code} - {activeItem.subject.name}
                      </span>
                    )}
                    {activeItem.assessment && (
                      <span className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800">
                        Assessment: {activeItem.assessment.title}
                      </span>
                    )}
                    {activeItem.question_reference && (
                      <span className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                        Question Ref: {activeItem.question_reference}
                      </span>
                    )}
                    {activeItem.page_url && (
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                        Route: {activeItem.page_url}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Status Update Form */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-950/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
                  Triage & Status Update
                </h3>

                {updateSuccess && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                    {updateSuccess}
                  </div>
                )}
                {updateError && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-medium">
                    {updateError}
                  </div>
                )}

                <form onSubmit={handleStatusUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Workflow Status
                      </label>
                      <select
                        value={updateStatus}
                        onChange={(e) => setUpdateStatus(e.target.value as FeedbackStatus)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                      >
                        {FEEDBACK_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {FEEDBACK_STATUS_METADATA[st].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {updateStatus === "closed" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          Mandatory Closure Outcome <span className="text-rose-500 dark:text-rose-400">*</span>
                        </label>
                        <select
                          value={updateOutcome}
                          onChange={(e) => setUpdateOutcome(e.target.value as FeedbackOutcome)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 font-semibold"
                        >
                          {FEEDBACK_OUTCOMES.map((out) => (
                            <option key={out} value={out}>
                              {FEEDBACK_OUTCOME_METADATA[out].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {updateStatus === "closed" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Student-Visible Resolution Note (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={updateResolutionNote}
                        onChange={(e) => setUpdateResolutionNote(e.target.value)}
                        placeholder="Explain resolution outcome to the student..."
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Status Change Message for Student Audit History (Optional)
                    </label>
                    <input
                      type="text"
                      value={updateStudentMessage}
                      onChange={(e) => setUpdateStudentMessage(e.target.value)}
                      placeholder="e.g., Assigned to syllabus review team for correction"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Add Private Internal Staff Note (Staff Only)
                    </label>
                    <input
                      type="text"
                      value={updateInternalNote}
                      onChange={(e) => setUpdateInternalNote(e.target.value)}
                      placeholder="e.g., Verified in schema migration 41; will patch in next release"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2"
                    >
                      {isPending ? "Applying..." : "Commit Status Change"}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Private Staff Notes */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Private Staff Internal Notes (Zero Student Visibility)
                </h3>

                {internalNotes.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No internal notes added yet.</p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {internalNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3 bg-amber-50/60 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 rounded-lg text-xs text-slate-800 dark:text-slate-100"
                      >
                        <div className="flex items-center justify-between font-semibold text-amber-900 dark:text-amber-200 mb-1">
                          <span>{note.author?.name || "Staff Member"}</span>
                          <span className="text-slate-400 font-normal">
                            {new Date(note.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{note.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Add Internal Note */}
                <form onSubmit={handleAddNote} className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={standaloneNote}
                    onChange={(e) => setStandaloneNote(e.target.value)}
                    placeholder="Add quick internal note..."
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isPending || !standaloneNote.trim()}
                    className="text-xs shrink-0"
                  >
                    Add Note
                  </Button>
                </form>
                {noteError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{noteError}</p>}
              </div>

              {/* Status Audit History Timeline */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Status Transition Audit History
                </h3>
                {detailLoading ? (
                  <p className="text-xs text-slate-400">Loading history...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-400">No transitions logged.</p>
                ) : (
                  <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-4 py-2">
                    {history.map((h) => {
                      const statusMeta = FEEDBACK_STATUS_METADATA[h.new_status] || FEEDBACK_STATUS_METADATA.new;
                      return (
                        <div key={h.id} className="relative pl-6">
                          <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusMeta.badgeClass}`}>
                              {statusMeta.label}
                            </span>
                            {h.new_outcome && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FEEDBACK_OUTCOME_METADATA[h.new_outcome]?.badgeClass || ""}`}>
                                {FEEDBACK_OUTCOME_METADATA[h.new_outcome]?.label}
                              </span>
                            )}
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              by {h.actor?.name || "Staff"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          {h.message && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                              {h.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveItem(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
