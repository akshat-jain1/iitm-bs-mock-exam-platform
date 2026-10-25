/**
 * Feedback Centre Validation Logic
 * Pure TypeScript validation with zero external dependencies.
 */

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_OUTCOMES,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackOutcome,
  FeedbackSubmissionInput,
  FeedbackStatusUpdateInput,
} from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
  errors?: never;
}

export interface ValidationFailure {
  valid: false;
  data?: never;
  errors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates and sanitizes a student feedback submission.
 */
export function validateFeedbackSubmission(raw: unknown): ValidationResult<FeedbackSubmissionInput> {
  const errors: Record<string, string> = {};

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: { form: 'Invalid submission data provided.' } };
  }

  const input = raw as Record<string, unknown>;

  // Category
  const categoryStr = typeof input.category === 'string' ? input.category.trim() : '';
  if (!categoryStr) {
    errors.category = 'Please select a feedback category.';
  } else if (!FEEDBACK_CATEGORIES.includes(categoryStr as FeedbackCategory)) {
    errors.category = `Invalid category. Allowed options: ${FEEDBACK_CATEGORIES.join(', ')}.`;
  }
  const category = categoryStr as FeedbackCategory;

  // Title
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    errors.title = 'Title is required.';
  } else if (title.length < 3) {
    errors.title = 'Title must be at least 3 characters long.';
  } else if (title.length > 200) {
    errors.title = 'Title cannot exceed 200 characters.';
  }

  // Description
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description) {
    errors.description = 'Description is required.';
  } else if (description.length < 10) {
    errors.description = 'Please provide more detail (at least 10 characters).';
  } else if (description.length > 5000) {
    errors.description = 'Description cannot exceed 5,000 characters.';
  }

  // Context: subject_id
  let subject_id: string | null = null;
  if (input.subject_id !== undefined && input.subject_id !== null && input.subject_id !== '') {
    const sid = String(input.subject_id).trim();
    if (!UUID_REGEX.test(sid)) {
      errors.subject_id = 'Invalid subject identifier.';
    } else {
      subject_id = sid;
    }
  }

  // Context: assessment_event_id
  let assessment_event_id: string | null = null;
  if (input.assessment_event_id !== undefined && input.assessment_event_id !== null && input.assessment_event_id !== '') {
    const aid = String(input.assessment_event_id).trim();
    if (!UUID_REGEX.test(aid)) {
      errors.assessment_event_id = 'Invalid assessment identifier.';
    } else {
      assessment_event_id = aid;
    }
  }

  // Context: question_reference
  let question_reference: string | null = null;
  if (input.question_reference !== undefined && input.question_reference !== null) {
    const qref = String(input.question_reference).trim();
    if (qref.length > 100) {
      errors.question_reference = 'Question reference cannot exceed 100 characters.';
    } else if (qref.length > 0) {
      question_reference = qref;
    }
  }

  // Context: page_url
  let page_url: string | null = null;
  if (input.page_url !== undefined && input.page_url !== null) {
    const purl = String(input.page_url).trim();
    if (purl.length > 500) {
      errors.page_url = 'Page URL reference cannot exceed 500 characters.';
    } else if (purl.length > 0) {
      page_url = purl;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      category,
      title,
      description,
      subject_id,
      assessment_event_id,
      question_reference,
      page_url,
    },
  };
}

/**
 * Validates administrative status and outcome updates.
 */
export function validateStatusUpdate(raw: unknown): ValidationResult<FeedbackStatusUpdateInput> {
  const errors: Record<string, string> = {};

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: { form: 'Invalid update request data.' } };
  }

  const input = raw as Record<string, unknown>;

  // Feedback ID
  const feedback_id = typeof input.feedback_id === 'string' ? input.feedback_id.trim() : '';
  if (!feedback_id || !UUID_REGEX.test(feedback_id)) {
    errors.feedback_id = 'Valid feedback item identifier required.';
  }

  // New Status
  const newStatusStr = typeof input.new_status === 'string' ? input.new_status.trim() : '';
  if (!newStatusStr || !FEEDBACK_STATUSES.includes(newStatusStr as FeedbackStatus)) {
    errors.new_status = `Invalid status. Allowed values: ${FEEDBACK_STATUSES.join(', ')}.`;
  }
  const new_status = newStatusStr as FeedbackStatus;

  // Outcome
  const outcomeStr = typeof input.outcome === 'string' && input.outcome.trim() ? input.outcome.trim() : null;

  if (new_status === 'closed') {
    if (!outcomeStr || !FEEDBACK_OUTCOMES.includes(outcomeStr as FeedbackOutcome)) {
      errors.outcome = 'Closing feedback requires selecting a resolution outcome (Implemented or Not Proceeding).';
    }
  } else {
    if (outcomeStr !== null) {
      errors.outcome = 'An open feedback item cannot have a final resolution outcome.';
    }
  }
  const outcome = outcomeStr as FeedbackOutcome | null;

  // Resolution note (optional student-visible note)
  let resolution_note: string | null = null;
  if (input.resolution_note !== undefined && input.resolution_note !== null) {
    const res = String(input.resolution_note).trim();
    if (res.length > 2000) {
      errors.resolution_note = 'Resolution note cannot exceed 2,000 characters.';
    } else if (res.length > 0) {
      resolution_note = res;
    }
  }

  // Student update message (optional history message)
  let student_message: string | null = null;
  if (input.student_message !== undefined && input.student_message !== null) {
    const msg = String(input.student_message).trim();
    if (msg.length > 2000) {
      errors.student_message = 'Student message cannot exceed 2,000 characters.';
    } else if (msg.length > 0) {
      student_message = msg;
    }
  }

  // Internal note (optional staff note)
  let internal_note: string | null = null;
  if (input.internal_note !== undefined && input.internal_note !== null) {
    const note = String(input.internal_note).trim();
    if (note.length > 4000) {
      errors.internal_note = 'Internal note cannot exceed 4,000 characters.';
    } else if (note.length > 0) {
      internal_note = note;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      feedback_id,
      new_status,
      outcome,
      resolution_note,
      student_message,
      internal_note,
    },
  };
}

/**
 * Validates a staff internal note addition.
 */
export function validateInternalNote(note: unknown): ValidationResult<string> {
  if (typeof note !== 'string') {
    return { valid: false, errors: { note: 'Note text must be a string.' } };
  }
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return { valid: false, errors: { note: 'Internal note cannot be empty.' } };
  }
  if (trimmed.length > 4000) {
    return { valid: false, errors: { note: 'Internal note cannot exceed 4,000 characters.' } };
  }
  return { valid: true, data: trimmed };
}
