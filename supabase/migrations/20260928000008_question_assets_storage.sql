-- ==============================================================================
-- PHASE 6: QUESTION ASSETS STORAGE BUCKET & RLS POLICIES
-- ==============================================================================

-- 1. Dedicated Supabase Storage Bucket for Question Assets
-- Private bucket: Anonymous users are strictly denied.
-- Only image/jpeg and image/png files are allowed, capped at 10MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'question_assets',
    'question_assets',
    false,
    10485760, -- 10MB limit per image
    ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png'];

-- 2. Row Level Security Policies on storage.objects

-- Admin Policy: Authenticated admin users can upload, update, delete, and view all assets
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins full access to question_assets storage'
    ) THEN
        CREATE POLICY "Admins full access to question_assets storage"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (
            bucket_id = 'question_assets'
            AND public.get_auth_user_role() = 'admin'
        )
        WITH CHECK (
            bucket_id = 'question_assets'
            AND public.get_auth_user_role() = 'admin'
        );
    END IF;
END $$;

-- Student Policy: Authenticated students can read question assets
-- Anonymous access is completely blocked. Students cannot upload, modify, or delete.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Students read question_assets storage'
    ) THEN
        CREATE POLICY "Students read question_assets storage"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'question_assets'
            AND public.get_auth_user_role() = 'student'
        );
    END IF;
END $$;
