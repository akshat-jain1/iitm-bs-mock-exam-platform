"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  istToIso,
  isoToISTDateAndTime,
  formatISTDate,
  formatISTTimeRange,
  getISTDateKey,
} from "@/lib/classes/datetime";
import {
  createClassScheduleAction,
  updateClassScheduleAction,
  deleteClassScheduleAction,
  type ScheduleFormData,
  type AdminSubjectItem,
} from "./actions";
import type { ClassScheduleItem } from "@/lib/classes/actions";

interface ClassScheduleManagementClientProps {
  initialSchedules: ClassScheduleItem[];
  subjects: AdminSubjectItem[];
}

export function ClassScheduleManagementClient({
  initialSchedules,
  subjects,
}: ClassScheduleManagementClientProps) {
  const [schedules, setSchedules] = useState<ClassScheduleItem[]>(initialSchedules);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal Dialog State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ClassScheduleItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State (Exactly the 5 business fields)
  const [formSubjectId, setFormSubjectId] = useState<string>(subjects[0]?.id || "");
  const [formDate, setFormDate] = useState<string>("");
  const [formStartTime, setFormStartTime] = useState<string>("09:00");
  const [formEndTime, setFormEndTime] = useState<string>("10:30");
  const [formClassroom, setFormClassroom] = useState<string>("");

  const openCreateModal = () => {
    setEditingSchedule(null);
    setFormSubjectId(subjects[0]?.id || "");
    const todayIST = getISTDateKey(new Date().toISOString());
    setFormDate(todayIST);
    setFormStartTime("09:00");
    setFormEndTime("10:30");
    setFormClassroom("");
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (schedule: ClassScheduleItem) => {
    setEditingSchedule(schedule);
    setFormSubjectId(schedule.subject_id);

    const { date: startDate, time: startTime } = isoToISTDateAndTime(schedule.starts_at);
    const { time: endTime } = isoToISTDateAndTime(schedule.ends_at);

    setFormDate(startDate);
    setFormStartTime(startTime || "09:00");
    setFormEndTime(endTime || "10:30");
    setFormClassroom(schedule.classroom);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    const payload: ScheduleFormData = {
      subjectId: formSubjectId,
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      classroom: formClassroom,
    };

    if (editingSchedule) {
      const res = await updateClassScheduleAction(editingSchedule.id, payload);
      setSubmitting(false);

      if (res.success) {
        setIsModalOpen(false);
        const subj = subjects.find((s) => s.id === formSubjectId);
        // Compute updated ISO strings locally using centralized istToIso
        const updatedStartsAt = istToIso(formDate, formStartTime);
        const updatedEndsAt = istToIso(formDate, formEndTime);

        setSchedules((prev) =>
          prev.map((item) =>
            item.id === editingSchedule.id
              ? {
                  ...item,
                  subject_id: formSubjectId,
                  classroom: formClassroom.trim(),
                  starts_at: updatedStartsAt,
                  ends_at: updatedEndsAt,
                  subjects: subj ? { id: subj.id, code: subj.code, name: subj.name } : item.subjects,
                }
              : item
          )
        );
      } else {
        setModalError(res.error || "Failed to update scheduled class.");
      }
    } else {
      const res = await createClassScheduleAction(payload);
      setSubmitting(false);

      if (res.success && res.id) {
        setIsModalOpen(false);
        const subj = subjects.find((s) => s.id === formSubjectId);
        const newStartsAt = istToIso(formDate, formStartTime);
        const newEndsAt = istToIso(formDate, formEndTime);

        const newEntry: ClassScheduleItem = {
          id: res.id,
          subject_id: formSubjectId,
          classroom: formClassroom.trim(),
          starts_at: newStartsAt,
          ends_at: newEndsAt,
          created_at: new Date().toISOString(),
          subjects: subj ? { id: subj.id, code: subj.code, name: subj.name } : null,
        };

        setSchedules((prev) => [...prev, newEntry].sort((a, b) => (a.starts_at > b.starts_at ? 1 : -1)));
      } else {
        setModalError(res.error || "Failed to create scheduled class.");
      }
    }
  };

  const handleDelete = async (id: string, subjectName: string, dateDisplay: string) => {
    if (!window.confirm(`Are you sure you want to delete the scheduled class for "${subjectName}" on ${dateDisplay}?`)) {
      return;
    }

    const res = await deleteClassScheduleAction(id);
    if (res.success) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } else {
      alert(res.error || "Failed to delete scheduled class.");
    }
  };

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    if (selectedSubjectFilter !== "all" && s.subject_id !== selectedSubjectFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = s.classroom.toLowerCase().includes(q);
      const matchSubj = s.subjects?.name.toLowerCase().includes(q) || false;
      const matchCode = s.subjects?.code.toLowerCase().includes(q) || false;
      return matchRoom || matchSubj || matchCode;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Class Schedule</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create, view, update, and manage upcoming and past scheduled lecture sessions.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs shrink-0"
        >
          + Schedule Class
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by subject name, code, or classroom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="sm:w-64">
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            >
              <option value="all">All Subjects ({subjects.length})</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Class Schedule Table */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-5 py-3.5">Date (IST)</th>
                <th className="px-5 py-3.5">Time Range</th>
                <th className="px-5 py-3.5">Subject</th>
                <th className="px-5 py-3.5">Classroom</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="max-w-xs mx-auto">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">No scheduled classes found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {searchQuery || selectedSubjectFilter !== "all"
                          ? "Try adjusting your search query or subject filter."
                          : "Click '+ Schedule Class' above to create your first lecture schedule."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSchedules.map((item) => {
                  const dateStr = formatISTDate(item.starts_at);
                  const timeRangeStr = formatISTTimeRange(item.starts_at, item.ends_at);
                  const subjectName = item.subjects?.name || "Unknown Subject";

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/75 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">
                        {dateStr}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {timeRangeStr}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-900 dark:text-slate-50 block">{subjectName}</span>
                        {item.subjects?.code && (
                          <span className="text-xs text-slate-400 font-mono">{item.subjects.code}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                        >
                          {item.classroom}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(item)}
                          className="h-8 px-2.5 text-xs border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(item.id, subjectName, dateStr)}
                          className="h-8 px-2.5 text-xs border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900 hover:border-rose-300 dark:hover:border-rose-700"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Dialog for Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-50">
                {editingSchedule ? "Edit Scheduled Class" : "Schedule New Class"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg font-bold p-1"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-md">
                  {modalError}
                </div>
              )}

              {/* 1. Subject */}
              <div>
                <label
                  htmlFor="scheduleSubjectSelect"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1"
                >
                  Subject *
                </label>
                <select
                  id="scheduleSubjectSelect"
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Selected from official platform subjects.
                </p>
              </div>

              {/* 2. Date */}
              <div>
                <label
                  htmlFor="scheduleDateInput"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1"
                >
                  Date (Indian Local Time) *
                </label>
                <input
                  id="scheduleDateInput"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                />
              </div>

              {/* 3 & 4. Start Time & End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="scheduleStartTimeInput"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1"
                  >
                    Start Time *
                  </label>
                  <input
                    id="scheduleStartTimeInput"
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="scheduleEndTimeInput"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1"
                  >
                    End Time *
                  </label>
                  <input
                    id="scheduleEndTimeInput"
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Times represent Indian Standard Time (IST / Asia/Kolkata). End time must be later than start time.
              </p>

              {/* 5. Classroom */}
              <div>
                <label
                  htmlFor="scheduleClassroomInput"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1"
                >
                  Classroom Code *
                </label>
                <input
                  id="scheduleClassroomInput"
                  type="text"
                  placeholder="e.g. 1A, 2B, 101, LAB2"
                  value={formClassroom}
                  onChange={(e) => setFormClassroom(e.target.value)}
                  maxLength={50}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Free-text room or hall identifier (letters, numbers, hyphens).
                </p>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  {submitting
                    ? editingSchedule
                      ? "Saving..."
                      : "Scheduling..."
                    : editingSchedule
                    ? "Save Changes"
                    : "Create Schedule"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
