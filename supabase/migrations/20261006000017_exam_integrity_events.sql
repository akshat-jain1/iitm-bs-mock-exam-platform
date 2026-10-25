-- ==============================================================================
-- EXAM INTEGRITY & ACTIVITY LOGGING V1
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.exam_integrity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'fullscreen_exit',
    'fullscreen_enter',
    'visibility_lost',
    'visibility_restored',
    'window_blur',
    'window_focus',
    'copy_attempt',
    'paste_attempt',
    'cut_attempt',
    'context_menu_attempt',
    'restricted_shortcut_attempt'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_attempt_id ON public.exam_integrity_events(attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_student_id ON public.exam_integrity_events(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_created_at ON public.exam_integrity_events(created_at);

-- Enable RLS
ALTER TABLE public.exam_integrity_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- 1. Student can INSERT only for their own attempts
CREATE POLICY "Students can insert own integrity events"
  ON public.exam_integrity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.attempts a
      WHERE a.id = attempt_id AND a.student_id = auth.uid()
    )
  );

-- 2. Student can SELECT only their own integrity events
CREATE POLICY "Students can read own integrity events"
  ON public.exam_integrity_events
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- 3. Admins can read all integrity events
CREATE POLICY "Admins can read all integrity events"
  ON public.exam_integrity_events
  FOR SELECT
  TO authenticated
  USING (public.get_auth_user_role() = 'admin');

-- 4. Admins can manage integrity events
CREATE POLICY "Admins can manage all integrity events"
  ON public.exam_integrity_events
  FOR ALL
  TO authenticated
  USING (public.get_auth_user_role() = 'admin');
