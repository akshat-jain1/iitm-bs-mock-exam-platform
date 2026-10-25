-- Allow zero-mark confirmation/instructional questions as present in source TCS iON PDFs
ALTER TABLE question_templates DROP CONSTRAINT IF EXISTS question_templates_marks_check;
ALTER TABLE question_templates ADD CONSTRAINT question_templates_marks_check CHECK (marks >= 0);

ALTER TABLE question_versions DROP CONSTRAINT IF EXISTS question_versions_marks_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_marks_check CHECK (marks >= 0);
