"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  updateAssessmentEventAction,
  addSubjectToEventAction,
  removeSubjectFromEventAction,
  updateAssessmentSubjectPaperAction,
} from "../actions";
import type { TestAccessMode, TestAttemptPolicy } from "@/lib/types/assessment";

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface AssessmentType {
  id: string;
  name: string;
}

interface PaperSetVersionOption {
  id: string;
  title: string;
  subject_id: string;
  assessment_type_id: string;
  created_at: string;
}

interface AssignedSubjectData {
  id: string; // assessment_subject_id
  subject_id: string;
  paper_set_version_id: string;
  subjects: Subject;
  paper_set_versions: {
    id: string;
    title: string;
    created_at: string;
  };
  attempt_count: number;
}

interface ExamManagementClientProps {
  event: {
    id: string;
    title: string;
    status: string;
    scheduled_start: string | null;
    assessment_type_id: string;
    assessment_types: AssessmentType;
    assignment_type?: 'PRODUCTION' | 'TEST';
    test_access_mode?: 'TESTER_ONLY' | 'ALL_ENROLLED' | null;
    test_attempt_policy?: 'UNLIMITED' | 'LIMITED' | null;
    test_max_attempts?: number | null;
    test_duration_mins?: number | null;
  };
  assignedSubjects: AssignedSubjectData[];
  allSubjects: Subject[];
  availablePaperVersions: PaperSetVersionOption[];
}

export function ExamManagementClient({
  event,
  assignedSubjects,
  allSubjects,
  availablePaperVersions,
}: ExamManagementClientProps) {
  const router = useRouter();

  // Event State
  const [title, setTitle] = useState(event.title);
  const [scheduledStart, setScheduledStart] = useState(
    event.scheduled_start ? event.scheduled_start.slice(0, 16) : ""
  );
  const [status, setStatus] = useState(event.status);
  const [assignmentType, setAssignmentType] = useState<"PRODUCTION" | "TEST">(
    event.assignment_type || "PRODUCTION"
  );
  const [testAccessMode, setTestAccessMode] = useState<TestAccessMode>(event.test_access_mode || "TESTER_ONLY");
  const [testAttemptPolicy, setTestAttemptPolicy] = useState<TestAttemptPolicy>(event.test_attempt_policy || "UNLIMITED");
  const [testMaxAttempts, setTestMaxAttempts] = useState(event.test_max_attempts || 1);
  const [testDurationMins, setTestDurationMins] = useState(event.test_duration_mins || 60);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventMsg, setEventMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add Subject Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedPaperVerId, setSelectedPaperVerId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Change Paper Version Modal State
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [targetAssignedSubj, setTargetAssignedSubj] = useState<AssignedSubjectData | null>(null);
  const [newPaperVerId, setNewPaperVerId] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const totalAttempts = assignedSubjects.reduce((sum, s) => sum + s.attempt_count, 0);

  // Filter available subjects: subjects not yet added
  const unassignedSubjects = allSubjects.filter(
    (subj) => !assignedSubjects.some((asubj) => asubj.subject_id === subj.id)
  );

  // Filter paper versions for the selected subject in add modal
  const eligiblePaperVersionsForAdd = availablePaperVersions.filter(
    (pv) =>
      pv.subject_id === selectedSubjectId &&
      pv.assessment_type_id === event.assessment_type_id
  );

  // Filter paper versions for the selected subject in change modal
  const eligiblePaperVersionsForChange = targetAssignedSubj
    ? availablePaperVersions.filter(
        (pv) =>
          pv.subject_id === targetAssignedSubj.subject_id &&
          pv.assessment_type_id === event.assessment_type_id
      )
    : [];

  const handleSaveEventDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventMsg(null);

    if (assignmentType === "TEST") {
      if (!testDurationMins || Number(testDurationMins) <= 0) {
        setEventMsg({ type: "error", text: "Test duration must be greater than 0 minutes." });
        return;
      }
      if (testAttemptPolicy === "LIMITED" && (!testMaxAttempts || Number(testMaxAttempts) <= 0)) {
        setEventMsg({ type: "error", text: "Max attempts must be at least 1 when attempt policy is LIMITED." });
        return;
      }
    }

    setIsSavingEvent(true);
    try {
      const res = await updateAssessmentEventAction({
        id: event.id,
        title: title.trim(),
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        status,
        assignment_type: assignmentType,
        ...(assignmentType === "TEST"
          ? {
              test_access_mode: testAccessMode,
              test_attempt_policy: testAttemptPolicy,
              test_max_attempts: testAttemptPolicy === "LIMITED" ? Number(testMaxAttempts) : null,
              test_duration_mins: Number(testDurationMins),
            }
          : {
              test_access_mode: null,
              test_attempt_policy: null,
              test_max_attempts: null,
              test_duration_mins: null,
            }),
      });

      if (!res.success) {
        setEventMsg({ type: "error", text: res.error || "Failed to update event." });
      } else {
        setEventMsg({ type: "success", text: "Assessment event updated successfully." });
        router.refresh();
      }
    } catch (err: unknown) {
      setEventMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error saving event.",
      });
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleOpenAddSubject = () => {
    const firstSubj = unassignedSubjects[0]?.id || "";
    setSelectedSubjectId(firstSubj);
    // Find matching version
    const firstMatchingVer = availablePaperVersions.find(
      (pv) => pv.subject_id === firstSubj && pv.assessment_type_id === event.assessment_type_id
    );
    setSelectedPaperVerId(firstMatchingVer?.id || "");
    setAddError(null);
    setAddModalOpen(true);
  };

  const handleSubjectChangeInAddModal = (subjId: string) => {
    setSelectedSubjectId(subjId);
    const matchingVer = availablePaperVersions.find(
      (pv) => pv.subject_id === subjId && pv.assessment_type_id === event.assessment_type_id
    );
    setSelectedPaperVerId(matchingVer?.id || "");
  };

  const handleAddSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!selectedSubjectId || !selectedPaperVerId) {
      setAddError("Please select both a Subject and an eligible Paper Version.");
      return;
    }

    setIsAdding(true);
    try {
      const res = await addSubjectToEventAction({
        assessment_event_id: event.id,
        subject_id: selectedSubjectId,
        paper_set_version_id: selectedPaperVerId,
      });

      if (!res.success) {
        setAddError(res.error || "Failed to add subject.");
      } else {
        setAddModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Error adding subject.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveSubject = async (assignedSubj: AssignedSubjectData) => {
    if (assignedSubj.attempt_count > 0) {
      alert(`Cannot remove subject: ${assignedSubj.attempt_count} student attempt(s) already exist.`);
      return;
    }

    if (
      confirm(
        `Are you sure you want to remove "${assignedSubj.subjects.name}" from this assessment event?`
      )
    ) {
      const res = await removeSubjectFromEventAction({
        assessment_subject_id: assignedSubj.id,
        assessment_event_id: event.id,
      });

      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to remove subject.");
      }
    }
  };

  const handleOpenChangePaper = (assignedSubj: AssignedSubjectData) => {
    if (assignedSubj.attempt_count > 0) {
      alert("Cannot change paper version: student attempts already exist for this subject.");
      return;
    }
    setTargetAssignedSubj(assignedSubj);
    setNewPaperVerId(assignedSubj.paper_set_version_id);
    setChangeError(null);
    setChangeModalOpen(true);
  };

  const handleChangePaperSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAssignedSubj || !newPaperVerId) return;

    setIsChanging(true);
    setChangeError(null);
    try {
      const res = await updateAssessmentSubjectPaperAction({
        assessment_subject_id: targetAssignedSubj.id,
        assessment_event_id: event.id,
        paper_set_version_id: newPaperVerId,
      });

      if (!res.success) {
        setChangeError(res.error || "Failed to update paper version.");
      } else {
        setChangeModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setChangeError(err instanceof Error ? err.message : "Error updating paper version.");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Breadcrumb & Title */}
      <div>
        <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
          <Link href="/admin/exams" className="hover:underline text-blue-600 dark:text-blue-400">
            Exams & Assessments
          </Link>
          <span>/</span>
          <span>Event Management</span>
        </div>
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{event.title}</h1>
          <Badge variant="secondary" className="font-mono text-xs">
            {event.assessment_types.name}
          </Badge>
          {assignmentType === "TEST" ? (
            <Badge variant="outline" className="text-xs uppercase font-bold tracking-wider bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
              TEST ASSIGNMENT
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs uppercase font-bold tracking-wider bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              PRODUCTION EXAM
            </Badge>
          )}
          <Badge
            variant={event.status === "Live" ? "default" : "secondary"}
            className="text-[10px] uppercase tracking-wider"
          >
            {event.status}
          </Badge>
        </div>
      </div>

      {/* Freeze Warning Banner if attempts exist */}
      {totalAttempts > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start space-x-3">
          <span className="text-lg">🔒</span>
          <div>
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Identity & Configuration Freeze Active ({totalAttempts} student attempt{totalAttempts !== 1 ? "s" : ""})
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Active student attempts have commenced for this assessment event. Assignment type, subject enrollments, subject inclusions, test parameters, and assigned immutable paper versions are permanently locked by database integrity triggers to protect exam fairness.
            </p>
          </div>
        </div>
      )}

      {/* Event Details Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 border-b border-slate-100 dark:border-slate-800 pb-3">
          Assessment Event Settings
        </h2>

        {eventMsg && (
          <div
            className={`p-3 rounded-md text-sm ${
              eventMsg.type === "success"
                ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
                : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
            }`}
          >
            {eventMsg.text}
          </div>
        )}

        <form onSubmit={handleSaveEventDetails} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Event Title *
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Scheduled Start (UTC)
              </label>
              <Input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Draft">Draft</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Live">Live</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Assignment Type *
              </label>
              <select
                value={assignmentType}
                onChange={(e) => setAssignmentType(e.target.value as "PRODUCTION" | "TEST")}
                disabled={totalAttempts > 0}
                className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
              >
                <option value="PRODUCTION">PRODUCTION (Official Exam)</option>
                <option value="TEST">TEST (Practice / Mock)</option>
              </select>
              {totalAttempts > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 font-medium">
                  Locked ({totalAttempts} attempt{totalAttempts !== 1 ? "s" : ""})
                </p>
              )}
            </div>
          </div>

          {assignmentType === "TEST" && (
            <div className="p-4 bg-purple-50/50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider">
                  Test Assignment Configuration
                </span>
                {totalAttempts > 0 ? (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">
                    Locked by Freeze Trigger ({totalAttempts} attempts)
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">
                    Editable before first attempt
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                    Access Mode
                  </label>
                  <select
                    value={testAccessMode}
                    onChange={(e) => setTestAccessMode(e.target.value as TestAccessMode)}
                    disabled={totalAttempts > 0}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
                  >
                    <option value="TESTER_ONLY">Tester Role Only (Bypass Enrollments)</option>
                    <option value="ALL_ENROLLED">All Enrolled Students + Testers</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                    Test Duration (Minutes)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={testDurationMins}
                    onChange={(e) => setTestDurationMins(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={totalAttempts > 0}
                    className="h-10 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                    Attempt Policy
                  </label>
                  <select
                    value={testAttemptPolicy}
                    onChange={(e) => setTestAttemptPolicy(e.target.value as TestAttemptPolicy)}
                    disabled={totalAttempts > 0}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
                  >
                    <option value="UNLIMITED">Unlimited Attempts</option>
                    <option value="LIMITED">Limited Attempts</option>
                  </select>
                </div>

                {testAttemptPolicy === "LIMITED" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                      Max Attempts
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={testMaxAttempts}
                      onChange={(e) => setTestMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={totalAttempts > 0}
                      className="h-10 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
                      required
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={isSavingEvent}
            >
              {isSavingEvent ? "Saving..." : "Save Event Details"}
            </Button>
          </div>
        </form>
      </div>

      {/* Included Subjects & Paper Assignment Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Included Subjects & Assigned Paper Versions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Each subject links to exactly one published immutable Paper Set Version. Students never select paper sets.
            </p>
          </div>

          <Button
            onClick={handleOpenAddSubject}
            disabled={unassignedSubjects.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs shrink-0 self-start sm:self-auto"
          >
            + Add Subject to Event
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50/50 dark:bg-slate-950/50">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Assigned Paper Version (Snapshot)
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Student Attempts
                </th>
                <th className="relative px-6 py-3.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {assignedSubjects.map((asubj) => (
                <tr key={asubj.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {asubj.subjects.name}
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px] mt-0.5">
                      {asubj.subjects.code}
                    </Badge>
                  </td>

                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {asubj.paper_set_versions.title}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Version ID: {asubj.paper_set_versions.id}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Published {new Date(asubj.paper_set_versions.created_at).toLocaleString()}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {asubj.attempt_count}
                      </span>
                      {asubj.attempt_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                          Locked
                        </Badge>
                      )}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium space-x-3">
                    <button
                      onClick={() => handleOpenChangePaper(asubj)}
                      disabled={asubj.attempt_count > 0}
                      className={`text-xs ${
                        asubj.attempt_count > 0
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200"
                      }`}
                      title={asubj.attempt_count > 0 ? "Cannot modify: attempts exist" : "Change assigned paper"}
                    >
                      Change Paper
                    </button>

                    <button
                      onClick={() => handleRemoveSubject(asubj)}
                      disabled={asubj.attempt_count > 0}
                      className={`text-xs ${
                        asubj.attempt_count > 0
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200"
                      }`}
                      title={asubj.attempt_count > 0 ? "Cannot remove: attempts exist" : "Remove subject"}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}

              {assignedSubjects.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No subjects have been assigned to this assessment event yet. Click &quot;+ Add Subject to Event&quot; above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Subject Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Add Subject to Assessment Event</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                ✕
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddSubjectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Select Subject *
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => handleSubjectChangeInAddModal(e.target.value)}
                  className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {unassignedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Assign Published Paper Version *
                </label>
                {eligiblePaperVersionsForAdd.length === 0 ? (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
                    <p className="font-bold text-amber-900 dark:text-amber-200">No Compatible Published Paper Versions Found</p>
                    <p>
                      No published paper versions match this subject and assessment category (<strong>{event.assessment_types.name}</strong>).
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      <strong>Why this happens:</strong> Question Bank papers are categorized by assessment type (e.g., Quiz 1 vs End Term). To use papers authored under another category, the assessment event must be created with that matching category. Only papers published into immutable snapshots can be assigned.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedPaperVerId}
                    onChange={(e) => setSelectedPaperVerId(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {eligiblePaperVersionsForAdd.map((pv) => (
                      <option key={pv.id} value={pv.id}>
                        {pv.title} (Snapshot {new Date(pv.created_at).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddModalOpen(false)}
                  disabled={isAdding}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={isAdding || eligiblePaperVersionsForAdd.length === 0}
                >
                  {isAdding ? "Adding..." : "Add Subject"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Paper Modal */}
      {changeModalOpen && targetAssignedSubj && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                Change Assigned Paper Version for {targetAssignedSubj.subjects.name}
              </h3>
              <button onClick={() => setChangeModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                ✕
              </button>
            </div>

            {changeError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
                {changeError}
              </div>
            )}

            <form onSubmit={handleChangePaperSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Select Published Paper Version *
                </label>
                {eligiblePaperVersionsForChange.length === 0 ? (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
                    <p className="font-bold text-amber-900 dark:text-amber-200">No Compatible Published Paper Versions Found</p>
                    <p>
                      No alternative published paper versions match this subject and assessment category (<strong>{event.assessment_types.name}</strong>).
                    </p>
                  </div>
                ) : (
                  <select
                    value={newPaperVerId}
                    onChange={(e) => setNewPaperVerId(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-md text-sm px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {eligiblePaperVersionsForChange.map((pv) => (
                      <option key={pv.id} value={pv.id}>
                        {pv.title} (Snapshot {new Date(pv.created_at).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangeModalOpen(false)}
                  disabled={isChanging}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={isChanging || eligiblePaperVersionsForChange.length === 0}
                >
                  {isChanging ? "Updating..." : "Update Assignment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
