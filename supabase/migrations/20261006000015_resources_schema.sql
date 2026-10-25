-- ==============================================================================
-- 20261006000015_resources_schema.sql
-- Academic Resources table, indexes, RLS, and private storage bucket
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    resource_type TEXT NOT NULL CHECK (resource_type IN ('youtube', 'pdf', 'website', 'formula_sheet', 'notes', 'other')),
    url TEXT DEFAULT '',
    storage_path TEXT DEFAULT NULL,
    topic TEXT DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_resources_subject_id ON public.resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_resources_is_published ON public.resources(is_published);
CREATE INDEX IF NOT EXISTS idx_resources_resource_type ON public.resources(resource_type);

-- Enable RLS
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Admins full access policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'resources' AND policyname = 'Admins manage resources'
    ) THEN
        CREATE POLICY "Admins manage resources"
        ON public.resources
        FOR ALL
        TO authenticated
        USING (get_auth_user_role() = 'admin'::user_role)
        WITH CHECK (get_auth_user_role() = 'admin'::user_role);
    END IF;
END $$;

-- Students read published resources policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'resources' AND policyname = 'Students read published resources'
    ) THEN
        CREATE POLICY "Students read published resources"
        ON public.resources
        FOR SELECT
        TO authenticated
        USING (
            get_auth_user_role() = 'student'::user_role
            AND is_published = true
        );
    END IF;
END $$;

-- Dedicated private storage bucket for academic resources
INSERT INTO storage.buckets (id, name, public)
VALUES ('academic_resources', 'academic_resources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for academic_resources
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins manage academic_resources storage'
    ) THEN
        CREATE POLICY "Admins manage academic_resources storage"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (
            bucket_id = 'academic_resources'
            AND get_auth_user_role() = 'admin'::user_role
        )
        WITH CHECK (
            bucket_id = 'academic_resources'
            AND get_auth_user_role() = 'admin'::user_role
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Students read academic_resources storage'
    ) THEN
        CREATE POLICY "Students read academic_resources storage"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'academic_resources'
            AND get_auth_user_role() = 'student'::user_role
        );
    END IF;
END $$;
