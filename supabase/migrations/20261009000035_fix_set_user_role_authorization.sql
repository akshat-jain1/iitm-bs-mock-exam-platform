-- ==============================================================================
-- MIGRATION: Fix set_user_role RPC Authorization and Permissions
-- ==============================================================================
-- Resolves authorization bypass where NULL v_caller_role bypassed PL/pgSQL
-- inequality check due to SQL three-valued logic (NULL != 'admin' is NULL/falsy).
-- Explicitly requires auth.uid() IS NOT NULL and v_caller_role IS NOT DISTINCT FROM 'admin'.
-- Revokes over-permissive EXECUTE privilege from anon and PUBLIC.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_user_role(
  target_user_id UUID,
  new_role public.user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role public.user_role;
  v_admin_count INT;
BEGIN
  -- 1. Strict identity verification: Caller must have an authenticated identity
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- 2. Strict caller authorization: Caller must exist and hold 'admin' role
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied: Only administrators can modify user roles';
  END IF;

  -- 3. Safety Guard: Prevent removing the last admin from the system
  IF new_role != 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.users WHERE role = 'admin' AND id != target_user_id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Action denied: Cannot demote the last remaining administrator';
    END IF;
  END IF;

  -- 4. Update target user's role
  UPDATE public.users
  SET role = new_role, updated_at = pg_catalog.now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- 5. Strict Permission Hardening: Revoke execute from public/anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role) TO authenticated;
