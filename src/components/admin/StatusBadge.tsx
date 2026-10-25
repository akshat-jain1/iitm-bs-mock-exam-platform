import React from "react";
import { ExamStatus, VerificationStatus } from "@/lib/types/admin";

interface StatusBadgeProps {
  status: ExamStatus | VerificationStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let classes = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ";

  switch (status) {
    // Exam Statuses
    case 'Live':
    case 'Published':
      classes += "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
      break;
    case 'Scheduled':
    case 'Ready':
    case 'Active':
      classes += "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
      break;
    case 'Completed':
    case 'Archived':
      classes += "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100";
      break;
    case 'Draft':
      classes += "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100";
      break;
    
    // Verification Statuses & Alerts
    case 'Needs Review':
    case 'Pending Review':
      classes += "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200";
      break;
    case 'Answer Needs Review':
      classes += "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-semibold";
      break;
    case 'Missing Image':
    case 'Code Needs Review':
    case 'Extraction Warning':
    case 'Suspended':
      classes += "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200";
      break;
    
    default:
      classes += "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100";
  }

  const displayLabel = status === 'Answer Needs Review' ? 'Answer Key Required' : status;

  return (
    <span className={classes}>
      {displayLabel}
    </span>
  );
}
