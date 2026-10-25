-- Fix RLS policy on question_versions and option_versions to support comprehension group questions
DROP POLICY IF EXISTS "Students can read question versions via attempt" ON public.question_versions;
CREATE POLICY "Students can read question versions via attempt" ON public.question_versions FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.section_versions sv 
  JOIN public.attempts a ON a.paper_set_version_id = sv.paper_set_version_id
  LEFT JOIN public.group_versions gv ON gv.section_version_id = sv.id
  WHERE ((sv.id = question_versions.section_version_id OR gv.id = question_versions.group_version_id)
    AND a.student_id = auth.uid())
));

DROP POLICY IF EXISTS "Students can read option versions via attempt" ON public.option_versions;
CREATE POLICY "Students can read option versions via attempt" ON public.option_versions FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.question_versions qv
  JOIN public.attempts a ON (
    EXISTS (
      SELECT 1 FROM public.section_versions sv
      LEFT JOIN public.group_versions gv ON gv.section_version_id = sv.id
      WHERE (sv.id = qv.section_version_id OR gv.id = qv.group_version_id)
        AND sv.paper_set_version_id = a.paper_set_version_id
    )
  )
  WHERE qv.id = option_versions.question_version_id AND a.student_id = auth.uid()
));
