-- Migration: 20261010000040_class_schedules.sql
-- Description: Add class_schedules table, indexes, check constraint, and RLS policies

CREATE TABLE IF NOT EXISTS public.class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    classroom TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_class_schedules_time_order CHECK (ends_at > starts_at)
);

-- Indexes for chronological queries and subject filtering
CREATE INDEX IF NOT EXISTS idx_class_schedules_starts_at ON public.class_schedules(starts_at ASC);
CREATE INDEX IF NOT EXISTS idx_class_schedules_ends_at ON public.class_schedules(ends_at ASC);
CREATE INDEX IF NOT EXISTS idx_class_schedules_subject_id ON public.class_schedules(subject_id);

-- Enable Row Level Security
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

-- Admins full access policy (create, read, update, delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'class_schedules' AND policyname = 'Admins manage class schedules'
    ) THEN
        CREATE POLICY "Admins manage class schedules"
        ON public.class_schedules
        FOR ALL
        TO authenticated
        USING (public.get_auth_user_role() = 'admin'::public.user_role)
        WITH CHECK (public.get_auth_user_role() = 'admin'::public.user_role);
    END IF;
END $$;

-- Authenticated students, testers, and admins read-only policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'class_schedules' AND policyname = 'Authenticated users read class schedules'
    ) THEN
        CREATE POLICY "Authenticated users read class schedules"
        ON public.class_schedules
        FOR SELECT
        TO authenticated
        USING (public.get_auth_user_role() IN ('student'::public.user_role, 'tester'::public.user_role, 'admin'::public.user_role));
    END IF;
END $$;

-- Explicit table permissions under platform convention (RLS enforces policy access)
GRANT ALL ON TABLE public.class_schedules TO authenticated, service_role;

