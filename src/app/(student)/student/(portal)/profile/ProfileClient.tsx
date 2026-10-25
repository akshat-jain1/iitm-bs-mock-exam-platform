"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStudentDisplayNameAction, updateStudentSubjectsAction } from "./actions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
}

interface ProfileClientProps {
  initialName: string;
  email: string;
  avatarUrl: string | null;
  allSubjects: SubjectItem[];
  initialSelectedSubjectIds: string[];
  hasActiveLiveExam: boolean;
  createdAt: string;
  completedAttemptsCount: number;
}

export function ProfileClient({
  initialName,
  email,
  avatarUrl,
  allSubjects,
  initialSelectedSubjectIds,
  hasActiveLiveExam,
  createdAt,
  completedAttemptsCount,
}: ProfileClientProps) {
  const router = useRouter();

  // Display name state
  const [displayName, setDisplayName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reliable saved and active subject selection state
  const [prevInitialSubjectIds, setPrevInitialSubjectIds] = useState(initialSelectedSubjectIds);
  const [savedSubjectIds, setSavedSubjectIds] = useState<string[]>(initialSelectedSubjectIds);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(initialSelectedSubjectIds);
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [subjectsMessage, setSubjectsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Synchronize saved selection if initialSelectedSubjectIds updates from revalidation
  if (prevInitialSubjectIds !== initialSelectedSubjectIds) {
    setPrevInitialSubjectIds(initialSelectedSubjectIds);
    setSavedSubjectIds(initialSelectedSubjectIds);
  }

  const initials = (displayName || "Student")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setNameMessage(null);

    try {
      const res = await updateStudentDisplayNameAction(displayName);
      if (res.success && res.name) {
        setDisplayName(res.name);
        setIsEditing(false);
        setNameMessage({ type: "success", text: "Display name updated successfully!" });
        router.refresh();
        setTimeout(() => setNameMessage(null), 4000);
      } else {
        setNameMessage({ type: "error", text: res.error || "Failed to update name." });
      }
    } catch (err: unknown) {
      console.error("Failed to update name:", err);
      setNameMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update name due to a network error.",
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleSubject = (subjectId: string) => {
    if (savingSubjects) return; // Prevent race conditions during save
    setSubjectsMessage(null);
    if (selectedSubjectIds.includes(subjectId)) {
      // Deselect
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subjectId));
    } else {
      // Select
      if (selectedSubjectIds.length >= 4) {
        setSubjectsMessage({
          type: "error",
          text: "Maximum 4 subjects limit reached. Deselect another subject first to choose this one.",
        });
        return;
      }
      setSelectedSubjectIds((prev) => [...prev, subjectId]);
    }
  };

  const hasSubjectChanges = (() => {
    if (selectedSubjectIds.length !== savedSubjectIds.length) return true;
    const savedSet = new Set(savedSubjectIds);
    return selectedSubjectIds.some((id) => !savedSet.has(id));
  })();

  const handleSaveSubjects = async () => {
    if (savingSubjects || !hasSubjectChanges) return;
    setSavingSubjects(true);
    setSubjectsMessage(null);

    // Snapshot exact array of selections being persisted
    const toSave = [...selectedSubjectIds];

    try {
      const res = await updateStudentSubjectsAction(toSave);
      if (res.success) {
        setSavedSubjectIds(toSave);
        setSelectedSubjectIds(toSave);
        setSubjectsMessage({
          type: "success",
          text: `Successfully saved ${toSave.length} subjects for this term!`,
        });
        router.refresh();
        setTimeout(() => setSubjectsMessage(null), 4000);
      } else {
        setSubjectsMessage({
          type: "error",
          text: res.error || "Failed to update selected subjects.",
        });
      }
    } catch (err: unknown) {
      console.error("Failed to update subjects:", err);
      setSubjectsMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update subjects due to a network error.",
      });
    } finally {
      setSavingSubjects(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Student Profile</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Manage your personal details and select the subjects you are taking this term.
        </p>
      </div>

      {nameMessage && (
        <div
          role="alert"
          className={`p-4 rounded-lg text-sm border flex items-center justify-between transition-all ${
            nameMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800"
          }`}
        >
          <span>{nameMessage.text}</span>
          <button
            type="button"
            onClick={() => setNameMessage(null)}
            className="text-xs font-semibold uppercase opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Profile Info Card */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-16 w-16 rounded-full border-2 border-white shadow-sm object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-xs">
                  {initials}
                </div>
              )}
              <div>
                <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-50">{displayName}</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{email}</CardDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-xs font-semibold">
                    Student
                  </Badge>
                  <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 text-xs">
                    Scaler Verified
                  </Badge>
                </div>
              </div>
            </div>

            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 self-start sm:self-center"
              >
                Edit Display Name
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Display Name Edit Form */}
          {isEditing ? (
            <form onSubmit={handleSaveName} className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
              <div>
                <label htmlFor="displayNameInput" className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  Edit Display Name
                </label>
                <input
                  id="displayNameInput"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={savingName}
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900"
                  placeholder="Enter your full name"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  This name will appear on your examination submissions and evaluation reports.
                </p>
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingName}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  {savingName ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingName}
                  onClick={() => {
                    setDisplayName(initialName);
                    setIsEditing(false);
                  }}
                  className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {/* Account Details Grid — Account ID / UUID is strictly removed */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Authenticated Email
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-50 block truncate">{email}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Controlled by Scaler Google Auth (Read-only)
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Enrolled Since
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-50 block">
                {createdAt ? new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Active Student"}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Registration Date</span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Assessments Attempted
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-50 text-base block">{completedAttemptsCount}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Completed exams & quizzes</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* My Subjects Selection Card */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-slate-50">My Subjects</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Select the subjects you are taking this term. You can select up to 4 subjects.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`font-mono text-xs px-3 py-1 font-semibold ${
                  selectedSubjectIds.length === 4
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                    : selectedSubjectIds.length > 0
                    ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {selectedSubjectIds.length} / 4 subjects selected
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {hasActiveLiveExam && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <div>
                <strong className="font-semibold block mb-0.5">Active Exam In Progress</strong>
                You currently have an active assessment in session. Any updates made here will apply to your profile and future exams, while your currently active exam session remains locked to its original subject snapshot.
              </div>
            </div>
          )}

          {subjectsMessage && (
            <div
              role="alert"
              className={`p-4 rounded-lg text-sm border flex items-center justify-between transition-all ${
                subjectsMessage.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800"
              }`}
            >
              <span>{subjectsMessage.text}</span>
              <button
                type="button"
                onClick={() => setSubjectsMessage(null)}
                className="text-xs font-semibold uppercase opacity-60 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {allSubjects.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm bg-slate-50 dark:bg-slate-950 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              No subjects currently configured on the platform.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allSubjects.map((sub) => {
                const isSelected = selectedSubjectIds.includes(sub.id);
                const isMaxReached = selectedSubjectIds.length >= 4 && !isSelected;

                return (
                  <label
                    key={sub.id}
                    className={`flex items-start justify-between p-4 rounded-lg border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-500/20"
                        : isMaxReached
                        ? "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 opacity-60 cursor-not-allowed"
                        : "border-slate-200/90 dark:border-slate-700/90 bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isMaxReached}
                        onChange={() => handleToggleSubject(sub.id)}
                        className={`h-4.5 w-4.5 mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 ${
                          isMaxReached ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{sub.name}</div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 font-medium mt-0.5">{sub.code}</div>
                      </div>
                    </div>

                    <div>
                      {isSelected ? (
                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800 text-[10px] font-semibold">
                          Selected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 text-[10px]">
                          Available
                        </Badge>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              * Your selected subjects determine which subjects you can attempt in an exam. Other subjects may still be visible in the exam paper.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {selectedSubjectIds.length === 4 ? (
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">✓ 4 / 4 subjects selected (Maximum reached)</span>
            ) : (
              <span>{selectedSubjectIds.length} / 4 subjects selected — {4 - selectedSubjectIds.length} remaining</span>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            {hasSubjectChanges && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingSubjects}
                onClick={() => {
                  setSelectedSubjectIds(savedSubjectIds);
                  setSubjectsMessage(null);
                }}
                className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900"
              >
                Reset
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              disabled={savingSubjects || !hasSubjectChanges}
              onClick={handleSaveSubjects}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5"
            >
              {savingSubjects ? "Saving..." : "Save My Subjects"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

