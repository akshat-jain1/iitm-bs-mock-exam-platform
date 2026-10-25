-- ==============================================================================
-- MIGRATION: Resilient User Role Lookup & Email RLS Compatibility
-- ==============================================================================

-- 1. Resilient Role Getter
-- Ensures role evaluation succeeds even if the user record is matched by verified OAuth email
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users
  WHERE id = auth.uid() OR email = (auth.jwt()->>'email')
  LIMIT 1;
$$;

-- 2. Email-based Self-Read Policy
-- Allows authenticated users whose OAuth JWT email matches public.users.email to read their record
DROP POLICY IF EXISTS "Users can read own profile by email" ON public.users;
CREATE POLICY "Users can read own profile by email"
ON public.users
FOR SELECT
TO authenticated
USING (email = (auth.jwt()->>'email'));
