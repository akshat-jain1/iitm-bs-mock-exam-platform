-- ==============================================================================
-- MIGRATION: Scaler Google Authentication & Domain Enforcement
-- ==============================================================================

-- Update handle_new_user trigger to enforce @sst.scaler.com domain on Google OAuth signups,
-- prevent client-side privilege escalation, and automatically set up foundation subject enrollments.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role public.user_role := 'student';
  v_name text;
  v_email text;
BEGIN
  v_email := LOWER(TRIM(new.email));
  
  -- Privilege Escalation Guard: Only pre-authorized admin IDs or explicitly provisioned
  -- admin accounts via trusted seed can have the admin role. All OAuth and self-signups default to student.
  IF (new.raw_user_meta_data->>'role') = 'admin' AND new.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    v_role := 'admin';
  ELSE
    v_role := 'student';
  END IF;

  -- Extract name from OAuth metadata or user metadata
  v_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    'Student'
  );

  -- Domain Restriction Guard for Google OAuth signups:
  -- Only official @sst.scaler.com accounts are permitted.
  IF (new.raw_app_meta_data->>'provider') = 'google' AND v_role = 'student' THEN
    IF v_email NOT LIKE '%@sst.scaler.com' THEN
      RAISE EXCEPTION 'Access restricted. Only official Scaler email accounts (@sst.scaler.com) are permitted.';
    END IF;
  END IF;

  -- Insert profile
  INSERT INTO public.users (id, role, name, email)
  VALUES (new.id, v_role, v_name, v_email)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email;

  -- Auto-enroll student into active foundation subjects if student
  IF v_role = 'student' THEN
    INSERT INTO public.student_enrollments (student_id, subject_id, is_active)
    SELECT new.id, s.id, true
    FROM public.subjects s
    LIMIT 8
    ON CONFLICT (student_id, subject_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
