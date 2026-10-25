/**
 * Assessment Assignment & Test Types
 * Centralized types for Production vs Test assessments
 */

export type AssessmentAssignmentType = 'PRODUCTION' | 'TEST';
export type TestAccessMode = 'TESTER_ONLY' | 'ALL_ENROLLED';
export type TestAttemptPolicy = 'UNLIMITED' | 'LIMITED';

export interface AssessmentEventConfig {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  assignment_type: AssessmentAssignmentType;
  test_access_mode?: TestAccessMode | null;
  test_attempt_policy?: TestAttemptPolicy | null;
  test_max_attempts?: number | null;
  test_duration_mins?: number | null;
}

export interface AttemptIdentity {
  id: string;
  student_id: string;
  assessment_subject_id: string;
  paper_set_version_id: string;
  attempt_number: number;
  is_test: boolean;
  status: 'Live' | 'Completed' | 'Terminated';
  start_time: string;
  end_time?: string | null;
}
