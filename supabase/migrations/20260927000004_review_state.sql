ALTER TABLE responses ADD COLUMN marked_for_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE responses ALTER COLUMN data DROP NOT NULL;

CREATE POLICY "Students can delete own responses" ON public.responses FOR DELETE
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid()));
