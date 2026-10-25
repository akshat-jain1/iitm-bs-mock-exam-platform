-- ==============================================================================
-- 20261008000029_remove_auto_subject_enrollment.sql
-- Remove automatic subject enrollment for new students upon signup and login
-- Students must explicitly choose up to 4 subjects on /student/profile
-- ==============================================================================

-- 1. Update handle_new_user: preserve all auth checks, role assignment, and profile upsert; remove auto-enrollment
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

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Update provision_user_on_login: preserve atomic lookup, ID sync, and profile insert; remove auto-enrollment
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

  RETURN COALESCE(v_role, 'student');
END;
$$;

-- Revoke execution from public, anon, and authenticated users
REVOKE EXECUTE ON FUNCTION public.provision_user_on_login(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role (used by server-side auth callback)
GRANT EXECUTE ON FUNCTION public.provision_user_on_login(uuid, text, text) TO service_role;
