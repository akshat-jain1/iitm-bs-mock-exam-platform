-- ==============================================================================
-- 20261008000028_provision_user_on_login.sql
-- Atomic, single-round-trip user provisioning and role resolution for OAuth login
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.provision_user_on_login(
  p_user_id uuid,
  p_email text,
  p_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := LOWER(TRIM(p_email));
  v_name text := COALESCE(NULLIF(TRIM(p_name), ''), 'Student');
  v_user_record record;
  v_role text;
BEGIN
  -- 1. Look up existing profile by id OR email
  SELECT id, role::text INTO v_user_record
  FROM public.users
  WHERE id = p_user_id OR email = v_email
  LIMIT 1;

  IF FOUND THEN
    v_role := v_user_record.role;

    -- If auth UUID diverged from existing profile record (e.g. pre-seeded by email), sync it
    IF v_user_record.id <> p_user_id THEN
      BEGIN
        UPDATE public.users
        SET id = p_user_id,
            updated_at = NOW()
        WHERE email = v_email;
      EXCEPTION
        WHEN OTHERS THEN
          -- In case of foreign key constraints or concurrency, log and proceed with resolved role
          RAISE WARNING 'Failed to sync user id for % to %: %', v_email, p_user_id, SQLERRM;
      END;
    END IF;

    RETURN v_role;
  END IF;

  -- 2. User profile not found — insert with role 'student'
  -- Safe against concurrent login races via ON CONFLICT
  BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (p_user_id, v_email, v_name, 'student'::public.user_role)
    ON CONFLICT (email) DO UPDATE
      SET id = EXCLUDED.id,
          name = EXCLUDED.name,
          updated_at = NOW()
    RETURNING role::text INTO v_role;
  EXCEPTION
    WHEN unique_violation THEN
      -- If conflict occurred on id with a different email, update email
      UPDATE public.users
      SET email = v_email,
          name = v_name,
          updated_at = NOW()
      WHERE id = p_user_id
      RETURNING role::text INTO v_role;
  END;

  IF v_role IS NULL THEN
    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = p_user_id OR email = v_email
    LIMIT 1;
  END IF;

  -- 3. Seed initial enrollments for new student
  -- Default up to 4 foundation subjects ordered by code ASC
  -- (Respects the enforce_max_enrollments trigger limit of 4 active subjects)
  INSERT INTO public.student_enrollments (student_id, subject_id, is_active)
  SELECT p_user_id, s.id, true
  FROM public.subjects s
  ORDER BY s.code ASC
  LIMIT 4
  ON CONFLICT (student_id, subject_id) DO NOTHING;

  RETURN COALESCE(v_role, 'student');
END;
$$;

-- Revoke execution from public, anon, and authenticated users
REVOKE EXECUTE ON FUNCTION public.provision_user_on_login(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role (used by server-side auth callback)
GRANT EXECUTE ON FUNCTION public.provision_user_on_login(uuid, text, text) TO service_role;
