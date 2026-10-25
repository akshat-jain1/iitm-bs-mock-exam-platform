/**
 * Feedback Centre Domain Types and Constants
 */

export const FEEDBACK_CATEGORIES = [
  'feature_request',
  'bug_report',
  'question_correction',
  'general',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = [
  'new',
  'under_review',
  'in_progress',
  'closed',
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_OUTCOMES = [
  'implemented',
  'not_proceeding',
] as const;

export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

export interface FeedbackCategoryMeta {
  id: FeedbackCategory;
  label: string;
  description: string;
  example: string;
  badgeClass: string;
}

export const FEEDBACK_CATEGORY_METADATA: Record<FeedbackCategory, FeedbackCategoryMeta> = {
  feature_request: {
    id: 'feature_request',
    label: 'Feature Request',
    description: 'Suggest new platform tools, calculators, analysis views, or UI enhancements.',
    example: 'e.g., "Add topic-wise performance analysis to student results"',
    badgeClass: 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  bug_report: {
    id: 'bug_report',
    label: 'Bug Report',
    description: 'Report technical errors, visual rendering glitches, or unexpected system behavior.',
    example: 'e.g., "The assessment page stopped loading during Quiz 2 window"',
    badgeClass: 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  question_correction: {
    id: 'question_correction',
    label: 'Question Correction',
    description: 'Flag potential answer key discrepancies, LaTeX typos, or ambiguous questions.',
    example: 'e.g., "Maths 1, Question 12 appears to have an incorrect answer key"',
    badgeClass: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  general: {
    id: 'general',
    label: 'General Feedback',
    description: 'Share academic feedback, mock exam impressions, or general observations.',
    example: 'e.g., "Mock exam timer and navigation layout felt true to the official interface"',
    badgeClass: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
};

export interface FeedbackStatusMeta {
  id: FeedbackStatus;
  label: string;
  description: string;
  badgeClass: string;
}

export const FEEDBACK_STATUS_METADATA: Record<FeedbackStatus, FeedbackStatusMeta> = {
  new: {
    id: 'new',
    label: 'New',
    description: 'Submitted and awaiting staff triage.',
    badgeClass: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  under_review: {
    id: 'under_review',
    label: 'Under Review',
    description: 'Currently being assessed by course instructors or technical staff.',
    badgeClass: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  in_progress: {
    id: 'in_progress',
    label: 'In Progress',
    description: 'Actively being addressed or scheduled for platform deployment.',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  closed: {
    id: 'closed',
    label: 'Closed',
    description: 'Resolved with a definitive outcome.',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
};

export interface FeedbackOutcomeMeta {
  id: FeedbackOutcome;
  label: string;
  badgeClass: string;
}

export const FEEDBACK_OUTCOME_METADATA: Record<FeedbackOutcome, FeedbackOutcomeMeta> = {
  implemented: {
    id: 'implemented',
    label: 'Implemented',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  not_proceeding: {
    id: 'not_proceeding',
    label: 'Not Proceeding',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
};

// Core Domain Records
export interface StudentFeedbackItem {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  title: string;
  description: string;
  status: FeedbackStatus;
  resolution_outcome: FeedbackOutcome | null;
  resolution_note: string | null;
  subject_id: string | null;
  assessment_event_id: string | null;
  question_reference: string | null;
  page_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined properties
  subject?: {
    id: string;
    code: string;
    name: string;
  } | null;
  assessment?: {
    id: string;
    title: string;
  } | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface FeedbackStatusHistoryItem {
  id: string;
  feedback_id: string;
  changed_by: string;
  old_status: FeedbackStatus | null;
  new_status: FeedbackStatus;
  old_outcome: FeedbackOutcome | null;
  new_outcome: FeedbackOutcome | null;
  message: string | null;
  created_at: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface FeedbackInternalNoteItem {
  id: string;
  feedback_id: string;
  author_id: string;
  note: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface FeedbackSubmissionInput {
  category: FeedbackCategory;
  title: string;
  description: string;
  subject_id?: string | null;
  assessment_event_id?: string | null;
  question_reference?: string | null;
  page_url?: string | null;
}

export interface FeedbackStatusUpdateInput {
  feedback_id: string;
  new_status: FeedbackStatus;
  outcome?: FeedbackOutcome | null;
  resolution_note?: string | null;
  student_message?: string | null;
  internal_note?: string | null;
}

export interface AdminFeedbackFilters {
  status?: FeedbackStatus | 'all';
  category?: FeedbackCategory | 'all';
  searchQuery?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminFeedbackStats {
  newCount: number;
  underReviewCount: number;
  inProgressCount: number;
  closedCount: number;
  totalCount: number;
}
