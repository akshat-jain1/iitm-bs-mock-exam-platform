-- ==============================================================================
-- PHASE 6: PDF QUESTION PAPER IMPORT & EXTRACTION WORKFLOW
-- ==============================================================================

-- 1. Import Job Status Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_job_status') THEN
        CREATE TYPE public.import_job_status AS ENUM (
            'Uploaded',
            'Extracting',
            'Draft',
            'Needs Review',
            'Ready',
            'Published',
            'Failed'
        );
    END IF;
END $$;

-- 2. Paper Import Jobs Table
CREATE TABLE IF NOT EXISTS public.paper_import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_set_id UUID NOT NULL REFERENCES public.paper_set_templates(id) ON DELETE CASCADE,
    source_filename TEXT NOT NULL,
    storage_path TEXT,
    file_size_bytes BIGINT NOT NULL,
    status public.import_job_status NOT NULL DEFAULT 'Uploaded',
    extraction_metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying paper import jobs
CREATE INDEX IF NOT EXISTS idx_paper_import_jobs_paper_set ON public.paper_import_jobs(paper_set_id);
CREATE INDEX IF NOT EXISTS idx_paper_import_jobs_status ON public.paper_import_jobs(status);

-- 3. Row Level Security for Import Jobs (Admins Only)
ALTER TABLE public.paper_import_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'paper_import_jobs' AND policyname = 'Admins full access to paper_import_jobs'
    ) THEN
        CREATE POLICY "Admins full access to paper_import_jobs"
        ON public.paper_import_jobs
        FOR ALL
        TO authenticated
        USING (public.get_auth_user_role() = 'admin')
        WITH CHECK (public.get_auth_user_role() = 'admin');
    END IF;
END $$;

-- 4. Supabase Storage Bucket for PDF Imports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pdf_imports',
    'pdf_imports',
    false,
    20971520, -- 20MB limit
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY['application/pdf'];

-- Admin-only storage policy for pdf_imports bucket
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins full access to pdf_imports storage'
    ) THEN
        CREATE POLICY "Admins full access to pdf_imports storage"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (
            bucket_id = 'pdf_imports'
            AND public.get_auth_user_role() = 'admin'
        )
        WITH CHECK (
            bucket_id = 'pdf_imports'
            AND public.get_auth_user_role() = 'admin'
        );
    END IF;
END $$;

-- 5. Enhanced Paper Validation for Publishing:
-- Enforce that questions cannot have unresolved verification statuses
CREATE OR REPLACE FUNCTION public.validate_paper_for_publishing(p_paper_set_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_invalid UUID;
    v_status verification_status;
    v_sec_count INT;
    v_q_count INT;
BEGIN
    -- Check at least 1 section exists
    SELECT COUNT(*) INTO v_sec_count
    FROM public.section_templates
    WHERE paper_set_id = p_paper_set_id;

    IF v_sec_count = 0 THEN
        RAISE EXCEPTION 'Validation Failed: Paper has no sections';
    END IF;

    -- Check at least 1 question exists in the paper
    SELECT COUNT(*) INTO v_q_count
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id);

    IF v_q_count = 0 THEN
        RAISE EXCEPTION 'Validation Failed: Paper contains no questions';
    END IF;

    -- Check that no question has an unreviewed / warning status
    SELECT q.id, q.verification_status INTO v_invalid, v_status
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.verification_status != 'Ready'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Validation Failed: Question % is not marked Ready (Current status: %)', v_invalid, v_status;
    END IF;

    -- Check MCQ questions: must have >= 2 options and exactly 1 correct option
    SELECT q.id INTO v_invalid
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'MCQ'
      AND (
          (SELECT COUNT(*) FROM public.option_templates o WHERE o.question_id = q.id) < 2 OR
          (SELECT COUNT(*) FROM public.eval_mcq_msq_templates e WHERE e.question_id = q.id) != 1
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Validation Failed: MCQ question % does not have valid options or exactly 1 correct option', v_invalid;
    END IF;

    -- Check MSQ questions: must have >= 2 options and >= 1 correct option
    SELECT q.id INTO v_invalid
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'MSQ'
      AND (
          (SELECT COUNT(*) FROM public.option_templates o WHERE o.question_id = q.id) < 2 OR
          (SELECT COUNT(*) FROM public.eval_mcq_msq_templates e WHERE e.question_id = q.id) = 0
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Validation Failed: MSQ question % does not have valid options or at least 1 correct option', v_invalid;
    END IF;

    -- Check NUMERICAL questions: must have exactly 1 evaluation config
    SELECT q.id INTO v_invalid
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'NUMERICAL'
      AND (SELECT COUNT(*) FROM public.eval_numeric_templates e WHERE e.question_id = q.id) != 1
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Validation Failed: NUMERICAL question % missing numerical evaluation config', v_invalid;
    END IF;

    -- Check NUMERICAL RANGE questions: min_val <= max_val
    SELECT q.id INTO v_invalid
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    JOIN public.eval_numeric_templates en ON en.question_id = q.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'NUMERICAL'
      AND en.mode = 'RANGE'
      AND en.min_val > en.max_val
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Validation Failed: NUMERICAL RANGE question % has min_val > max_val', v_invalid;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
