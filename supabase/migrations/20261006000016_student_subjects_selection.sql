-- ==============================================================================
-- MIGRATION: Student Subject Selection & Exam Scope Enforcement
-- ==============================================================================

-- 1. Ensure verify_enrollment_role allows deactivation and only blocks student role violations on active enrollments
CREATE OR REPLACE FUNCTION verify_enrollment_role()
RETURNS TRIGGER AS $$
DECLARE v_role user_role;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = NEW.student_id;
    IF NEW.is_active = FALSE THEN
        RETURN NEW;
    END IF;
    IF v_role != 'student' THEN
        RAISE EXCEPTION 'Only users with role student can be enrolled in subjects';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Clean up any existing non-student enrollments
DELETE FROM public.student_enrollments 
WHERE student_id IN (SELECT id FROM users WHERE role != 'student');

-- 3. For existing students who have > 4 active enrollments, keep first 4 by subject code active and deactivate the rest
WITH ranked_enrollments AS (
  SELECT 
    se.id,
    se.student_id,
    ROW_NUMBER() OVER (PARTITION BY se.student_id ORDER BY s.code ASC) as rn
  FROM public.student_enrollments se
  JOIN public.subjects s ON s.id = se.subject_id
  WHERE se.is_active = true
)
UPDATE public.student_enrollments
SET is_active = false
WHERE id IN (
  SELECT id FROM ranked_enrollments WHERE rn > 4
);

-- 4. Update trigger to enforce max 4 subjects
CREATE OR REPLACE FUNCTION enforce_max_enrollments()
RETURNS TRIGGER AS $$
DECLARE
    active_count INT;
BEGIN
    IF NEW.is_active = TRUE THEN
        PERFORM 1 FROM users WHERE id = NEW.student_id FOR UPDATE;
        
        SELECT COUNT(*) INTO active_count 
        FROM student_enrollments 
        WHERE student_id = NEW.student_id AND is_active = TRUE AND id != NEW.id;

        IF active_count >= 4 THEN
            RAISE EXCEPTION 'Student cannot exceed 4 active subject enrollments';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Update handle_new_user to enroll in max 4
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role public.user_role := 'student';
  v_name text;
  v_email text;
BEGIN
  v_email := LOWER(TRIM(new.email));
  
  IF (new.raw_user_meta_data->>'role') = 'admin' AND new.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    v_role := 'admin';
  ELSE
    v_role := 'student';
  END IF;

  v_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    'Student'
  );

  IF (new.raw_app_meta_data->>'provider') = 'google' AND v_role = 'student' THEN
    IF v_email NOT LIKE '%@sst.scaler.com' THEN
      RAISE EXCEPTION 'Access restricted. Only official Scaler email accounts (@sst.scaler.com) are permitted.';
    END IF;
  END IF;

  INSERT INTO public.users (id, role, name, email)
  VALUES (new.id, v_role, v_name, v_email)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email;

  IF v_role = 'student' THEN
    INSERT INTO public.student_enrollments (student_id, subject_id, is_active)
    SELECT new.id, s.id, true
    FROM public.subjects s
    ORDER BY s.code ASC
    LIMIT 4
    ON CONFLICT (student_id, subject_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. RLS for students to update/insert own enrollments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'student_enrollments' AND policyname = 'Students can update own enrollments'
  ) THEN
    CREATE POLICY "Students can update own enrollments" ON public.student_enrollments
      FOR UPDATE USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'student_enrollments' AND policyname = 'Students can insert own enrollments'
  ) THEN
    CREATE POLICY "Students can insert own enrollments" ON public.student_enrollments
      FOR INSERT WITH CHECK (student_id = auth.uid());
  END IF;
END $$;

-- 7. Read policies for exam paper versions during active assessment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'paper_set_versions' AND policyname = 'Students can read paper versions for active assessment'
  ) THEN
    CREATE POLICY "Students can read paper versions for active assessment" ON public.paper_set_versions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assessment_subjects as_all
        JOIN public.attempts a ON a.student_id = auth.uid()
        JOIN public.assessment_subjects as_att ON as_att.id = a.assessment_subject_id
        WHERE as_all.paper_set_version_id = paper_set_versions.id
          AND as_all.assessment_event_id = as_att.assessment_event_id
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'section_versions' AND policyname = 'Students can read section versions for active assessment'
  ) THEN
    CREATE POLICY "Students can read section versions for active assessment" ON public.section_versions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assessment_subjects as_all
        JOIN public.attempts a ON a.student_id = auth.uid()
        JOIN public.assessment_subjects as_att ON as_att.id = a.assessment_subject_id
        WHERE as_all.paper_set_version_id = section_versions.paper_set_version_id
          AND as_all.assessment_event_id = as_att.assessment_event_id
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_versions' AND policyname = 'Students can read group versions for active assessment'
  ) THEN
    CREATE POLICY "Students can read group versions for active assessment" ON public.group_versions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assessment_subjects as_all
        JOIN public.section_versions sv ON sv.paper_set_version_id = as_all.paper_set_version_id
        JOIN public.attempts a ON a.student_id = auth.uid()
        JOIN public.assessment_subjects as_att ON as_att.id = a.assessment_subject_id
        WHERE sv.id = group_versions.section_version_id
          AND as_all.assessment_event_id = as_att.assessment_event_id
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'question_versions' AND policyname = 'Students can read question versions for active assessment'
  ) THEN
    CREATE POLICY "Students can read question versions for active assessment" ON public.question_versions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assessment_subjects as_all
        JOIN public.section_versions sv ON sv.paper_set_version_id = as_all.paper_set_version_id
        JOIN public.attempts a ON a.student_id = auth.uid()
        JOIN public.assessment_subjects as_att ON as_att.id = a.assessment_subject_id
        WHERE (sv.id = question_versions.section_version_id OR EXISTS (
          SELECT 1 FROM public.group_versions gv WHERE gv.id = question_versions.group_version_id AND gv.section_version_id = sv.id
        ))
        AND as_all.assessment_event_id = as_att.assessment_event_id
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'option_versions' AND policyname = 'Students can read option versions for active assessment'
  ) THEN
    CREATE POLICY "Students can read option versions for active assessment" ON public.option_versions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assessment_subjects as_all
        JOIN public.section_versions sv ON sv.paper_set_version_id = as_all.paper_set_version_id
        JOIN public.question_versions qv ON (qv.section_version_id = sv.id OR EXISTS (
          SELECT 1 FROM public.group_versions gv WHERE gv.id = qv.group_version_id AND gv.section_version_id = sv.id
        ))
        JOIN public.attempts a ON a.student_id = auth.uid()
        JOIN public.assessment_subjects as_att ON as_att.id = a.assessment_subject_id
        WHERE qv.id = option_versions.question_version_id
          AND as_all.assessment_event_id = as_att.assessment_event_id
      )
    );
  END IF;
END $$;
