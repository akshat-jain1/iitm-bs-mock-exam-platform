-- Personal practice is isolated from official attempts, results and TEST allowances.
CREATE TABLE public.student_practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_attempt_id uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(responses) = 'object'),
  marked_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(marked_question_ids) = 'array'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress', 'Completed')),
  score numeric,
  max_marks numeric,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status = 'In Progress' AND completed_at IS NULL AND score IS NULL AND max_marks IS NULL)
      OR (status = 'Completed' AND completed_at IS NOT NULL AND score IS NOT NULL AND max_marks IS NOT NULL))
);
CREATE INDEX student_practice_owner_recent ON public.student_practice_sessions(student_id, started_at DESC);
CREATE UNIQUE INDEX student_practice_one_active ON public.student_practice_sessions(student_id, source_attempt_id) WHERE status = 'In Progress';
ALTER TABLE public.student_practice_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_practice_sessions FROM anon, authenticated;
GRANT SELECT ON public.student_practice_sessions TO authenticated;
GRANT ALL ON public.student_practice_sessions TO service_role;
CREATE POLICY student_practice_read_own ON public.student_practice_sessions FOR SELECT TO authenticated USING (student_id = auth.uid());
COMMENT ON TABLE public.student_practice_sessions IS 'Unlimited untimed subject practice from an owned, completed, review-released immutable paper. Mutations and grading use authenticated server actions with service role.';
