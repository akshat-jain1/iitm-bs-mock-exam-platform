"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  createAssessmentEventAction,
  deleteAssessmentEventAction,
} from "./actions";

interface AssessmentType {
  id: string;
  name: string;
}

export interface AssessmentEventSummary {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  assessment_type_id: string;
  assignment_type?: 'PRODUCTION' | 'TEST';
  test_access_mode?: 'TESTER_ONLY' | 'ALL_ENROLLED' | null;
  test_attempt_policy?: 'UNLIMITED' | 'LIMITED' | null;
  test_max_attempts?: number | null;
  test_duration_mins?: number | null;
  assessment_types: AssessmentType;
  subject_count: number;
  attempt_count: number;
}

interface ExamListClientProps {
  events: AssessmentEventSummary[];
  assessmentTypes: AssessmentType[];
}

export function ExamListClient({ events, assessmentTypes }: ExamListClientProps) {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState(assessmentTypes[0]?.id || "");
  const [scheduledStart, setScheduledStart] = useState("");
  const [status, setStatus] = useState("Draft");
  const [assignmentType, setAssignmentType] = useState<'PRODUCTION' | 'TEST'>('PRODUCTION');
  const [testAccessMode, setTestAccessMode] = useState<'TESTER_ONLY' | 'ALL_ENROLLED'>('TESTER_ONLY');
  const [testAttemptPolicy, setTestAttemptPolicy] = useState<'UNLIMITED' | 'LIMITED'>('UNLIMITED');
  const [testMaxAttempts, setTestMaxAttempts] = useState<number>(1);
  const [testDurationMins, setTestDurationMins] = useState<number>(60);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.assessment_types.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || e.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!title.trim()) {
      setCreateError("Event title is required.");
      return;
    }

    if (assignmentType === "TEST") {
      if (!testDurationMins || Number(testDurationMins) <= 0) {
        setCreateError("Test duration must be greater than 0 minutes.");
        return;
      }
      if (testAttemptPolicy === "LIMITED" && (!testMaxAttempts || Number(testMaxAttempts) <= 0)) {
        setCreateError("Max attempts must be greater than 0 for LIMITED policy.");
        return;
      }
    }

    setIsCreating(true);
    try {
      const res = await createAssessmentEventAction({
        title: title.trim(),
        assessment_type_id: typeId,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        status,
        assignment_type: assignmentType,
        test_access_mode: assignmentType === "TEST" ? testAccessMode : null,
        test_attempt_policy: assignmentType === "TEST" ? testAttemptPolicy : null,
        test_max_attempts: assignmentType === "TEST" && testAttemptPolicy === "LIMITED" ? Number(testMaxAttempts) : null,
        test_duration_mins: assignmentType === "TEST" ? Number(testDurationMins) : null,
      });

      if (!res.success) {
        setCreateError(res.error || "Failed to create assessment event.");
      } else {
        setCreateModalOpen(false);
        setTitle("");
        setScheduledStart("");
        setAssignmentType("PRODUCTION");
        setTestAccessMode("TESTER_ONLY");
        setTestAttemptPolicy("UNLIMITED");
        setTestMaxAttempts(1);
        setTestDurationMins(60);
        router.push(`/admin/exams/${res.eventId}`);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Error creating assessment event.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteEvent = async (event: AssessmentEventSummary) => {
    if (event.attempt_count > 0) {
      alert(`Cannot delete event: ${event.attempt_count} student attempt(s) exist. Identity is locked.`);
      return;
    }

    if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
      const res = await deleteAssessmentEventAction(event.id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete assessment event.");
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Examinations & Assessment Events</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Schedule live examination windows, include subjects, and assign immutable paper set versions.
          </p>
        </div>
        <div className="flex space-x-3 shrink-0">
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
          >
            + Create Assessment Event
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="w-full sm:max-w-sm">
          <Input
            placeholder="Search events by title or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 w-full"
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="h-9 w-full sm:w-auto border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Events Table Container with Dedicated Horizontal Scroll Wrapper */}
      <div className="overflow-hidden bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-xl">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider min-w-[260px]">
                  Event Title & Type
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Scheduled Start
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">
                  Subjects & Attempts
                </th>
                <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap min-w-[150px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {filteredEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-6 py-4 max-w-md">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-50 break-words">{evt.title}</span>
                      {evt.assignment_type === "TEST" && (
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 shrink-0">
                          TEST ({evt.test_duration_mins || 60}m)
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="font-mono text-xs shrink-0">
                        {evt.assessment_types.name}
                      </Badge>
                      {evt.assignment_type === "TEST" && (
                        <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-100 dark:border-purple-900 shrink-0">
                          {evt.test_access_mode === "TESTER_ONLY" ? "Testers Only" : "All Enrolled"} • {evt.test_attempt_policy === "LIMITED" ? `Max ${evt.test_max_attempts} attempts` : "Unlimited"}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono truncate max-w-[200px]" title={evt.id}>ID: {evt.id}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge
                      variant={evt.status === "Live" ? "default" : "secondary"}
                      className="text-[10px] uppercase tracking-wider"
                    >
                      {evt.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {evt.scheduled_start ? (
                      new Date(evt.scheduled_start).toLocaleString()
                    ) : (
                      <span className="italic text-slate-400">Unscheduled</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                      {evt.subject_count} Subject{evt.subject_count !== 1 ? "s" : ""}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {evt.attempt_count} Student Attempt{evt.attempt_count !== 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium space-x-3 shrink-0">
                    <Link
                      href={`/admin/exams/${evt.id}`}
                      className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 font-semibold px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors"
                    >
                      Manage Event →
                    </Link>
                    <button
                      onClick={() => handleDeleteEvent(evt)}
                      disabled={evt.attempt_count > 0}
                      className={`text-xs p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        evt.attempt_count > 0
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      }`}
                      title={evt.attempt_count > 0 ? "Cannot delete: attempts exist" : "Delete event"}
                      aria-label={`Delete event ${evt.title}`}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}

            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-3xl">📅</span>
                    <p className="font-medium text-slate-700 dark:text-slate-200">No assessment events found.</p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Create an assessment event above to begin assigning subjects and published paper versions.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Create Assessment Event</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Assessment Event Title *
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. October 2026 Quiz 1 Window"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Assessment Type *
                </label>
                <select
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
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
                  Scheduled Start Time (UTC)
                </label>
                <Input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  className="h-10"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Draft">Draft</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Live">Live</option>
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Assignment Type *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignmentType("PRODUCTION")}
                      className={`px-3 py-2 text-xs font-semibold rounded-md border text-center transition-all ${
                        assignmentType === "PRODUCTION"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      Production Exam
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentType("TEST")}
                      className={`px-3 py-2 text-xs font-semibold rounded-md border text-center transition-all ${
                        assignmentType === "TEST"
                          ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      Test Assignment
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {assignmentType === "PRODUCTION"
                      ? "Official window: students require verified course enrollment, standard durations apply."
                      : "Practice/mock engine: customizable test duration, early exits, repeat attempt policies."}
                  </p>
                </div>

                {assignmentType === "TEST" && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                          Test Access Mode *
                        </label>
                        <select
                          value={testAccessMode}
                          onChange={(e) => setTestAccessMode(e.target.value as 'TESTER_ONLY' | 'ALL_ENROLLED')}
                          className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-md text-xs px-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="TESTER_ONLY">Tester Role Only (Bypass Enrollments)</option>
                          <option value="ALL_ENROLLED">All Enrolled Students + Testers</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                          Test Duration (Minutes) *
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={testDurationMins}
                          onChange={(e) => setTestDurationMins(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-9 text-xs"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                          Attempt Policy *
                        </label>
                        <select
                          value={testAttemptPolicy}
                          onChange={(e) => setTestAttemptPolicy(e.target.value as 'UNLIMITED' | 'LIMITED')}
                          className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-md text-xs px-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="UNLIMITED">Unlimited Attempts</option>
                          <option value="LIMITED">Limited Attempts</option>
                        </select>
                      </div>

                      {testAttemptPolicy === "LIMITED" && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                            Max Attempts Allowed *
                          </label>
                          <Input
                            type="number"
                            min="1"
                            value={testMaxAttempts}
                            onChange={(e) => setTestMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-9 text-xs"
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                  {isCreating ? "Creating..." : "Create & Manage"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
