import type { QuestionImageAsset } from "@/lib/question-images";

export type QuestionType = "MCQ" | "MSQ" | "NUMERICAL";

export interface Option {
  id: string;
  text: string;
  textHtml?: string;
  imageUrl?: string;
  imageUrls?: string[];
  images?: QuestionImageAsset[];
  image_assets?: unknown | null;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  textHtml?: string;
  marks: number;
  options?: Option[]; // For MCQ / MSQ
  imageUrl?: string;
  imageUrls?: string[];
  images?: QuestionImageAsset[];
  image_assets?: unknown | null;
  codeSnippet?: string;
  groupId?: string; // If it belongs to a comprehension group
  sectionId?: string; // If it belongs to a specific section
  sourceQuestionNumber?: number;
}

export interface QuestionGroup {
  id: string;
  title: string;
  titleHtml?: string;
  passage: string;
  passageHtml?: string;
  imageUrl?: string;
  imageUrls?: string[];
  image_assets?: unknown | null;
  codeSnippet?: string;
  referenceMaterial?: ReferenceMaterial;
  questionIds: string[];
}

export type ReferenceItem = 
  | { type: 'text'; content: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; url: string; alt?: string; storage_path?: string };

export interface ReferenceSection {
  title: string;
  items: ReferenceItem[];
}

export interface ReferenceMaterial {
  title?: string;
  sections?: ReferenceSection[];
  content?: string;
  assets?: Array<{ storage_path?: string; url?: string }>;
}

export interface ExamSection {
  id: string;
  title: string;
  referenceMaterial?: ReferenceMaterial;
}

export interface Exam {
  id: string;
  title: string;
  candidateName: string;
  candidateId: string;
  durationSeconds: number;
  referenceMaterial?: ReferenceMaterial;
  sections?: ExamSection[];
  questions: Question[];
  groups: QuestionGroup[];
}

export interface QuestionStatus {
  visited: boolean;
  answered: boolean;
  markedForReview: boolean;
}

// Responses
export type ResponseValue = string | string[] | number | null;

export interface ExamResponses {
  [questionId: string]: ResponseValue;
}

export interface ExamStatuses {
  [questionId: string]: QuestionStatus;
}
