export type ExamStatus = 'Draft' | 'Scheduled' | 'Live' | 'Completed' | 'Archived';
export type VerificationStatus = 'Ready' | 'Needs Review' | 'Missing Image' | 'Code Needs Review' | 'Answer Needs Review' | 'Extraction Warning';
export type QuestionType = 'MCQ' | 'MSQ' | 'NUMERICAL';

export interface AdminExam {
  id: string;
  name: string;
  subject: string;
  status: ExamStatus;
  date: string | null; // ISO date string or null if Draft
  durationMinutes: number;
  questionCount: number;
  studentCount: number;
  updatedAt: string;
}

export interface AdminQuestion {
  id: string;
  type: QuestionType;
  preview: string;
  section: string;
  marks: number;
  verificationStatus: VerificationStatus;
  updatedAt: string;
  source: string;
}

export interface AdminStudent {
  id: string;
  name: string;
  email: string;
  enrolledExams: number;
  lastActivity: string;
  status: 'Active' | 'Suspended';
}

export interface AdminResult {
  examId: string;
  examName: string;
  studentCount: number;
  submittedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  status: 'Published' | 'Pending Review';
}
