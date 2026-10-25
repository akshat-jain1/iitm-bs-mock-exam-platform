-- ==============================================================================
-- MIGRATION: Admin Role Management & Privilege Delegation
-- ==============================================================================

-- 1. RLS UPDATE POLICY: Only authenticated administrators can update user records
DROP POLICY IF EXISTS "Admins can update user profiles" ON public.users;
CREATE POLICY "Admins can update user profiles"
ON public.users
FOR UPDATE
TO authenticated
USING (public.get_auth_user_role() = 'admin')
WITH CHECK (public.get_auth_user_role() = 'admin');

-- 2. SECURE ROLE MANAGEMENT RPC FUNCTION
-- Allows an authorized admin to promote or demote users between 'student' and 'admin'.
CREATE OR REPLACE FUNCTION public.set_user_role(
  target_user_id UUID,
  new_role public.user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role public.user_role;
  v_admin_count INT;
BEGIN
  -- Strict caller verification: Caller must have 'admin' role
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied: Only administrators can modify user roles';
  END IF;

  -- Safety Guard: Prevent removing the last admin from the system
  IF new_role != 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.users WHERE role = 'admin' AND id != target_user_id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Action denied: Cannot demote the last remaining administrator';
    END IF;
  END IF;

  -- Update role
  UPDATE public.users
  SET role = new_role, updated_at = NOW()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;
