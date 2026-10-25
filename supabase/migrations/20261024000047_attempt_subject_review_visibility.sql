-- Reviews/practice follow subjects actually taken, even after enrollment changes.
-- The restrictive assignment policy still hides TEST subjects from students.
CREATE POLICY own_attempt_subject_visibility ON public.assessment_subjects
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.attempts a
  WHERE a.assessment_subject_id = assessment_subjects.id AND a.student_id = auth.uid()
));

-- Tester-only assignments intentionally do not require subject enrollment.
CREATE POLICY tester_assignment_subject_visibility ON public.assessment_subjects
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.assessment_events e
  WHERE e.id = assessment_event_id AND e.assignment_type = 'TEST'
    AND e.test_access_mode = 'TESTER_ONLY' AND public.can_access_assignment('TEST')
));
