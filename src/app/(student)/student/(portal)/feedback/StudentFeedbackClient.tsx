"use client";

import React, { useState, useTransition } from "react";
import {
  FeedbackCategory,
  StudentFeedbackItem,
  FeedbackStatusHistoryItem,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_METADATA,
  FEEDBACK_STATUS_METADATA,
  FEEDBACK_OUTCOME_METADATA,
} from "@/lib/feedback/types";
import {
  submitFeedbackAction,
  getStudentFeedbackDetailAction,
  ContextOptions,
  SubmitFeedbackResult,
} from "./actions";
import { Button } from "@/components/ui/Button";

interface StudentFeedbackClientProps {
  initialSubmissions: StudentFeedbackItem[];
  contextOptions: ContextOptions;
  feedbackEmail?: string | null;
}

export function StudentFeedbackClient({
  initialSubmissions,
  contextOptions,
  feedbackEmail,
}: StudentFeedbackClientProps) {
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [submissions, setSubmissions] = useState<StudentFeedbackItem[]>(initialSubmissions);

  // Form state
  const [category, setCategory] = useState<FeedbackCategory>("feature_request");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [questionRef, setQuestionRef] = useState("");
  const [pageUrl, setPageUrl] = useState("");

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // History detail modal state
  const [selectedItem, setSelectedItem] = useState<StudentFeedbackItem | null>(null);
  const [itemHistory, setItemHistory] = useState<FeedbackStatusHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleOpenDetail = async (item: StudentFeedbackItem) => {
    setSelectedItem(item);
    setHistoryLoading(true);
    try {
      const res = await getStudentFeedbackDetailAction(item.id);
      if (res.feedback) {
        setSelectedItem(res.feedback);
      }
      setItemHistory(res.history);
    } catch (err) {
      console.error("Failed to load history details:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setFormErrors({});

    startTransition(async () => {
      const result: SubmitFeedbackResult = await submitFeedbackAction({
        category,
        title,
        description,
        subject_id: subjectId || null,
        assessment_event_id: assessmentId || null,
        question_reference: questionRef || null,
        page_url: pageUrl || null,
      });

      if (!result.success) {
        setSubmitError(result.error || "An error occurred while submitting feedback.");
        if (result.fieldErrors) {
          setFormErrors(result.fieldErrors);
        }
        return;
      }

      setSubmitSuccess("Your feedback has been submitted successfully! You can track its review progress under My Submissions.");
      // Reset form
      setTitle("");
      setDescription("");
      setQuestionRef("");
      setPageUrl("");
      setSubjectId("");
      setAssessmentId("");

      // Optimistically insert into submissions list
      if (result.feedbackId) {
        const newRecord: StudentFeedbackItem = {
          id: result.feedbackId,
          user_id: "",
          category,
          title,
          description,
          status: "new",
          resolution_outcome: null,
          resolution_note: null,
          subject_id: subjectId || null,
          assessment_event_id: assessmentId || null,
          question_reference: questionRef || null,
          page_url: pageUrl || null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          subject: contextOptions.subjects.find((s) => s.id === subjectId) || null,
          assessment: contextOptions.assessments.find((a) => a.id === assessmentId) || null,
        };
        setSubmissions((prev) => [newRecord, ...prev]);
      }
    });
  };

  const selectedCatMeta = FEEDBACK_CATEGORY_METADATA[category];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
              Feedback Centre
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              Submit platform improvements, report technical issues, or request question corrections.
            </p>
          </div>
          {feedbackEmail && (
            <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-xs">
              <span className="font-medium text-slate-700 dark:text-slate-200 mr-1.5">Direct Contact:</span>
              <a
                href={`mailto:${feedbackEmail}`}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium underline"
              >
                {feedbackEmail}
              </a>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 mt-6">
          <button
            type="button"
            onClick={() => setActiveTab("submit")}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "submit"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
            }`}
          >
            Submit Feedback
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <span>My Submissions</span>
            {submissions.length > 0 && (
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs px-2 py-0.5 rounded-full font-medium">
                {submissions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Submit Feedback Form */}
      {activeTab === "submit" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-700/90 shadow-xs p-6 sm:p-8">
          {submitSuccess && (
            <div className="mb-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-start justify-between">
              <div>
                <p className="font-semibold">Thank you for your feedback!</p>
                <p className="mt-0.5">{submitSuccess}</p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitSuccess(null)}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 font-bold ml-4"
              >
                ×
              </button>
            </div>
          )}

          {submitError && (
            <div className="mb-6 p-4 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
              <p className="font-semibold">Submission failed</p>
              <p className="mt-0.5">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category Selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2">
                Feedback Category <span className="text-rose-500 dark:text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FEEDBACK_CATEGORIES.map((catKey) => {
                  const meta = FEEDBACK_CATEGORY_METADATA[catKey];
                  const isSelected = category === catKey;
                  return (
                    <div
                      key={catKey}
                      onClick={() => setCategory(catKey)}
                      className={`cursor-pointer rounded-lg border p-3.5 transition-all text-left ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/50 shadow-xs ring-1 ring-blue-500"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-50">{meta.label}</span>
                        <input
                          type="radio"
                          name="category"
                          value={catKey}
                          checked={isSelected}
                          onChange={() => setCategory(catKey)}
                          className="h-4 w-4 text-blue-600 dark:text-blue-400 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                        />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{meta.description}</p>
                    </div>
                  );
                })}
              </div>
              {formErrors.category && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{formErrors.category}</p>
              )}
            </div>

            {/* Category Guidance Banner */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-700/80 rounded-lg p-3.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Example for {selectedCatMeta.label}:</span>{" "}
              {selectedCatMeta.example}
            </div>

            {/* Title Input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="feedback-title" className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Subject / Summary <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <span className="text-xs text-slate-400">{title.length}/200</span>
              </div>
              <input
                id="feedback-title"
                type="text"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of your feedback or observation..."
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  formErrors.title ? "border-rose-300 dark:border-rose-700 bg-rose-50/30 dark:bg-rose-950/30" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                }`}
              />
              {formErrors.title && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{formErrors.title}</p>}
            </div>

            {/* Description Textarea */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="feedback-desc" className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Detailed Description <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <span className="text-xs text-slate-400">{description.length}/5000</span>
              </div>
              <textarea
                id="feedback-desc"
                required
                rows={5}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide complete details, steps to reproduce, or academic reasoning..."
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  formErrors.description ? "border-rose-300 dark:border-rose-700 bg-rose-50/30 dark:bg-rose-950/30" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                }`}
              />
              {formErrors.description && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{formErrors.description}</p>
              )}
            </div>

            {/* Optional Context Section */}
            <div className="border-t border-slate-200/80 dark:border-slate-700/80 pt-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">
                Related Context <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(Optional)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Subject Selector */}
                <div>
                  <label htmlFor="feedback-subject" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Relevant Subject
                  </label>
                  <select
                    id="feedback-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- No specific subject --</option>
                    {contextOptions.subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.code}: {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assessment Selector */}
                <div>
                  <label htmlFor="feedback-assessment" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Relevant Assessment
                  </label>
                  <select
                    id="feedback-assessment"
                    value={assessmentId}
                    onChange={(e) => setAssessmentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- No specific assessment --</option>
                    {contextOptions.assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Question Reference */}
                <div>
                  <label htmlFor="feedback-qref" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Question Reference / Number
                  </label>
                  <input
                    id="feedback-qref"
                    type="text"
                    maxLength={100}
                    value={questionRef}
                    onChange={(e) => setQuestionRef(e.target.value)}
                    placeholder="e.g., Section 1, Question 14"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Page URL */}
                <div>
                  <label htmlFor="feedback-url" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Page or Route Reference
                  </label>
                  <input
                    id="feedback-url"
                    type="text"
                    maxLength={500}
                    value={pageUrl}
                    onChange={(e) => setPageUrl(e.target.value)}
                    placeholder="e.g., /student/results or /student/exams"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end pt-4 border-t border-slate-200/80 dark:border-slate-700/80">
              <Button
                type="submit"
                disabled={isPending || title.trim().length < 3 || description.trim().length < 10}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 shadow-xs"
              >
                {isPending ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: My Submissions */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">No submissions yet</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Have an idea, found a bug, or spotted a question typo? Use the Submit Feedback tab to let us know.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("submit")}
                className="mt-4"
              >
                Submit Feedback
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {submissions.map((item) => {
                const catMeta = FEEDBACK_CATEGORY_METADATA[item.category] || FEEDBACK_CATEGORY_METADATA.general;
                const statusMeta = FEEDBACK_STATUS_METADATA[item.status] || FEEDBACK_STATUS_METADATA.new;
                const outcomeMeta = item.resolution_outcome ? FEEDBACK_OUTCOME_METADATA[item.resolution_outcome] : null;

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-700/90 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${catMeta.badgeClass}`}>
                            {catMeta.label}
                          </span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                          {outcomeMeta && (
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${outcomeMeta.badgeClass}`}>
                              {outcomeMeta.label}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                        {item.description}
                      </p>

                      {/* Resolution note if closed */}
                      {item.status === "closed" && item.resolution_note && (
                        <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200">
                          <span className="font-semibold text-slate-900 dark:text-slate-50">Resolution Note:</span>{" "}
                          {item.resolution_note}
                        </div>
                      )}

                      {/* Context pills */}
                      {(item.subject || item.question_reference || item.assessment) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                          {item.subject && (
                            <span className="bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                              Subject: {item.subject.code}
                            </span>
                          )}
                          {item.assessment && (
                            <span className="bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                              Assessment: {item.assessment.title}
                            </span>
                          )}
                          {item.question_reference && (
                            <span className="bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                              Ref: {item.question_reference}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        Updated {new Date(item.updated_at).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(item)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                      >
                        View Review Timeline →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detail & History Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
              <div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${FEEDBACK_CATEGORY_METADATA[selectedItem.category]?.badgeClass || ""}`}>
                  {FEEDBACK_CATEGORY_METADATA[selectedItem.category]?.label}
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-2">{selectedItem.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 text-xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Full Description */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </h4>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed border border-slate-200/80 dark:border-slate-700/80">
                  {selectedItem.description}
                </div>
              </div>

              {/* Status and Outcome */}
              <div className="flex flex-wrap gap-3 items-center">
                <span className={`text-xs px-3 py-1 rounded-full font-medium border ${FEEDBACK_STATUS_METADATA[selectedItem.status]?.badgeClass || ""}`}>
                  Status: {FEEDBACK_STATUS_METADATA[selectedItem.status]?.label}
                </span>
                {selectedItem.resolution_outcome && (
                  <span className={`text-xs px-3 py-1 rounded-full font-medium border ${FEEDBACK_OUTCOME_METADATA[selectedItem.resolution_outcome]?.badgeClass || ""}`}>
                    Outcome: {FEEDBACK_OUTCOME_METADATA[selectedItem.resolution_outcome]?.label}
                  </span>
                )}
              </div>

              {/* Resolution Note if Closed */}
              {selectedItem.status === "closed" && selectedItem.resolution_note && (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider mb-1">
                    Resolution Note
                  </h4>
                  <p className="text-sm text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap">
                    {selectedItem.resolution_note}
                  </p>
                </div>
              )}

              {/* Status Audit History Timeline */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Review & Status Timeline
                </h4>
                {historyLoading ? (
                  <p className="text-xs text-slate-400">Loading timeline...</p>
                ) : itemHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No review updates logged yet.</p>
                ) : (
                  <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-5 py-2">
                    {itemHistory.map((h) => {
                      const statusMeta = FEEDBACK_STATUS_METADATA[h.new_status] || FEEDBACK_STATUS_METADATA.new;
                      return (
                        <div key={h.id} className="relative pl-6">
                          <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusMeta.badgeClass}`}>
                              {statusMeta.label}
                            </span>
                            {h.new_outcome && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FEEDBACK_OUTCOME_METADATA[h.new_outcome]?.badgeClass || ""}`}>
                                {FEEDBACK_OUTCOME_METADATA[h.new_outcome]?.label}
                              </span>
                            )}
                            <span className="text-xs text-slate-400">
                              {new Date(h.created_at).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          {h.message && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-md border border-slate-200/70 dark:border-slate-700/70">
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

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedItem(null)}
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
