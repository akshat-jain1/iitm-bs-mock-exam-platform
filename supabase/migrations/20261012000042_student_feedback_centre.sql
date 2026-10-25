-- ==============================================================================
-- 20261012000042_student_feedback_centre.sql
-- Student Feedback Centre Schema, Audit History, Internal Notes, and RLS Policies
-- ==============================================================================
-- 1. student_feedback: Core feedback records submitted by students/testers.
--    - Enforces 4-state lifecycle: 'new', 'under_review', 'in_progress', 'closed'
--    - Enforces closure outcome: 'implemented' or 'not_proceeding' ONLY when closed
--    - Open items cannot have a resolution outcome; closed items MUST have one
--    - Contextual links to subjects and assessment_events
--
-- 2. student_feedback_status_history: Audit trail of status transitions.
--    - Visible to the submitter (their own item) and administrators
--    - Records actor, old/new status, outcome, and student-visible message
--
-- 3. student_feedback_internal_notes: Private staff notes.
--    - Strictly restricted to administrators via RLS
--    - Zero student visibility guaranteed at the database level
--
-- 4. update_feedback_status_v1: Atomic stored procedure for status transitions.
--    - Enforces admin authorization, validates transitions, records audit log
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: student_feedback
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (char_length(category) <= 50),
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 200),
    description TEXT NOT NULL CHECK (char_length(trim(description)) > 0 AND char_length(description) <= 5000),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'in_progress', 'closed')),
    resolution_outcome TEXT CHECK (resolution_outcome IS NULL OR resolution_outcome IN ('implemented', 'not_proceeding')),
    resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    assessment_event_id UUID REFERENCES public.assessment_events(id) ON DELETE SET NULL,
    question_reference TEXT CHECK (question_reference IS NULL OR char_length(question_reference) <= 100),
    page_url TEXT CHECK (page_url IS NULL OR char_length(page_url) <= 500),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_feedback_status_outcome CHECK (
        (status = 'closed' AND resolution_outcome IS NOT NULL) OR
        (status != 'closed' AND resolution_outcome IS NULL)
    )
);

-- Indexes for student and admin query optimization
CREATE INDEX IF NOT EXISTS idx_student_feedback_user_created
    ON public.student_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_feedback_status_updated
    ON public.student_feedback(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_feedback_category
    ON public.student_feedback(category);

CREATE INDEX IF NOT EXISTS idx_student_feedback_subject
    ON public.student_feedback(subject_id)
    WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_feedback_assessment
    ON public.student_feedback(assessment_event_id)
    WHERE assessment_event_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Table: student_feedback_status_history
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_feedback_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES public.student_feedback(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    old_status TEXT CHECK (old_status IS NULL OR old_status IN ('new', 'under_review', 'in_progress', 'closed')),
    new_status TEXT NOT NULL CHECK (new_status IN ('new', 'under_review', 'in_progress', 'closed')),
    old_outcome TEXT CHECK (old_outcome IS NULL OR old_outcome IN ('implemented', 'not_proceeding')),
    new_outcome TEXT CHECK (new_outcome IS NULL OR new_outcome IN ('implemented', 'not_proceeding')),
    message TEXT CHECK (message IS NULL OR char_length(message) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_feedback_history_feedback
    ON public.student_feedback_status_history(feedback_id, created_at ASC);

-- ------------------------------------------------------------------------------
-- 3. Table: student_feedback_internal_notes (Private Staff Notes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_feedback_internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES public.student_feedback(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    note TEXT NOT NULL CHECK (char_length(trim(note)) > 0 AND char_length(note) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_feedback_notes_feedback
    ON public.student_feedback_internal_notes(feedback_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Enable Row Level Security (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.student_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_feedback_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_feedback_internal_notes ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. RLS Policies: student_feedback
-- ------------------------------------------------------------------------------
-- Students can read their own feedback; admins can read all feedback
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback' AND policyname = 'Users read own feedback or admin reads all'
    ) THEN
        CREATE POLICY "Users read own feedback or admin reads all"
        ON public.student_feedback
        FOR SELECT
        TO authenticated
        USING (
            user_id = auth.uid() OR
            public.get_auth_user_role() = 'admin'::public.user_role
        );
    END IF;
END $$;

-- Authenticated users can insert feedback for themselves only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback' AND policyname = 'Users insert own feedback'
    ) THEN
        CREATE POLICY "Users insert own feedback"
        ON public.student_feedback
        FOR INSERT
        TO authenticated
        WITH CHECK (
            user_id = auth.uid()
        );
    END IF;
END $$;

-- Only administrators can update feedback (status, outcome, note)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback' AND policyname = 'Admins update feedback'
    ) THEN
        CREATE POLICY "Admins update feedback"
        ON public.student_feedback
        FOR UPDATE
        TO authenticated
        USING (public.get_auth_user_role() = 'admin'::public.user_role)
        WITH CHECK (public.get_auth_user_role() = 'admin'::public.user_role);
    END IF;
END $$;

-- Only administrators can delete feedback
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback' AND policyname = 'Admins delete feedback'
    ) THEN
        CREATE POLICY "Admins delete feedback"
        ON public.student_feedback
        FOR DELETE
        TO authenticated
        USING (public.get_auth_user_role() = 'admin'::public.user_role);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. RLS Policies: student_feedback_status_history
-- ------------------------------------------------------------------------------
-- Students can read history for their own items; admins can read all
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback_status_history' AND policyname = 'Users read history of own feedback or admin reads all'
    ) THEN
        CREATE POLICY "Users read history of own feedback or admin reads all"
        ON public.student_feedback_status_history
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.student_feedback sf
                WHERE sf.id = feedback_id AND sf.user_id = auth.uid()
            ) OR
            public.get_auth_user_role() = 'admin'::public.user_role
        );
    END IF;
END $$;

-- Only admins or service role can insert status history
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback_status_history' AND policyname = 'Admins insert status history'
    ) THEN
        CREATE POLICY "Admins insert status history"
        ON public.student_feedback_status_history
        FOR INSERT
        TO authenticated
        WITH CHECK (public.get_auth_user_role() = 'admin'::public.user_role);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. RLS Policies: student_feedback_internal_notes (STRICT ADMIN ONLY)
-- ------------------------------------------------------------------------------
-- Students have ZERO access to internal notes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_feedback_internal_notes' AND policyname = 'Admins manage internal notes'
    ) THEN
        CREATE POLICY "Admins manage internal notes"
        ON public.student_feedback_internal_notes
        FOR ALL
        TO authenticated
        USING (public.get_auth_user_role() = 'admin'::public.user_role)
        WITH CHECK (public.get_auth_user_role() = 'admin'::public.user_role);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. Explicit Grants
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_feedback TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.student_feedback_status_history TO authenticated, service_role;
GRANT ALL ON TABLE public.student_feedback_internal_notes TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. Atomic Status Transition Procedure
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_feedback_status_v1(
    p_feedback_id UUID,
    p_new_status TEXT,
    p_outcome TEXT DEFAULT NULL,
    p_resolution_note TEXT DEFAULT NULL,
    p_student_message TEXT DEFAULT NULL,
    p_internal_note TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_service BOOLEAN;
    v_current RECORD;
BEGIN
    -- 1. Identity & Role Verification (fail-closed)
    v_is_service := (auth.jwt()->>'role') = 'service_role' OR (session_user = 'postgres' AND auth.jwt() IS NULL);
    IF NOT v_is_service THEN
        v_caller_id := auth.uid();
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'Unauthorized: Authentication required';
        END IF;

        IF public.get_auth_user_role()::text IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
        END IF;
    ELSE
        -- Service role uses explicit actor or fallback to first admin
        v_caller_id := COALESCE(p_actor_id, auth.uid(), (SELECT id FROM public.users WHERE role = 'admin' LIMIT 1));
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'Unauthorized: Administrator actor required';
        END IF;
    END IF;

    -- 2. Fetch current record with row lock
    SELECT * INTO v_current
    FROM public.student_feedback
    WHERE id = p_feedback_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Feedback item % not found', p_feedback_id;
    END IF;

    -- 3. Validate status & outcome
    IF p_new_status NOT IN ('new', 'under_review', 'in_progress', 'closed') THEN
        RAISE EXCEPTION 'Invalid status: %', p_new_status;
    END IF;

    IF p_new_status = 'closed' THEN
        IF p_outcome IS NULL OR p_outcome NOT IN ('implemented', 'not_proceeding') THEN
            RAISE EXCEPTION 'Closing feedback requires a valid outcome (implemented or not_proceeding)';
        END IF;
    ELSE
        IF p_outcome IS NOT NULL THEN
            RAISE EXCEPTION 'Open feedback item cannot have a resolution outcome';
        END IF;
    END IF;

    -- 4. Update student_feedback
    UPDATE public.student_feedback
    SET status = p_new_status,
        resolution_outcome = p_outcome,
        resolution_note = p_resolution_note,
        updated_at = now()
    WHERE id = p_feedback_id;

    -- 5. Record status history audit log
    INSERT INTO public.student_feedback_status_history (
        feedback_id,
        changed_by,
        old_status,
        new_status,
        old_outcome,
        new_outcome,
        message
    ) VALUES (
        p_feedback_id,
        v_caller_id,
        v_current.status,
        p_new_status,
        v_current.resolution_outcome,
        p_outcome,
        p_student_message
    );

    -- 6. Insert internal note if provided
    IF p_internal_note IS NOT NULL AND char_length(trim(p_internal_note)) > 0 THEN
        INSERT INTO public.student_feedback_internal_notes (
            feedback_id,
            author_id,
            note
        ) VALUES (
            p_feedback_id,
            v_caller_id,
            trim(p_internal_note)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'feedback_id', p_feedback_id,
        'old_status', v_current.status,
        'new_status', p_new_status,
        'outcome', p_outcome
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_feedback_status_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_feedback_status_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. Atomic Student Submission Procedure with Database Advisory Lock
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_student_feedback_v1(
    p_category TEXT,
    p_title TEXT,
    p_description TEXT,
    p_subject_id UUID DEFAULT NULL,
    p_assessment_event_id UUID DEFAULT NULL,
    p_question_reference TEXT DEFAULT NULL,
    p_page_url TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_user_id UUID;
    v_is_service BOOLEAN;
    v_clean_title TEXT;
    v_clean_desc TEXT;
    v_feedback_id UUID;
    v_burst_count INT;
    v_hour_count INT;
    v_day_count INT;
BEGIN
    -- 1. Derive authenticated identity (fail-closed)
    v_is_service := (auth.jwt()->>'role') = 'service_role' OR (session_user = 'postgres' AND auth.jwt() IS NULL);
    v_caller_id := auth.uid();

    IF v_is_service THEN
        -- Service role is invoked by trusted server actions; use explicit user ID
        v_user_id := COALESCE(p_user_id, v_caller_id);
    ELSE
        -- Authenticated student: strictly enforce session identity
        -- Student-submitted user_id parameter cannot override authenticated auth.uid()
        v_user_id := v_caller_id;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required';
    END IF;

    -- 2. Input sanitization & validation
    v_clean_title := trim(p_title);
    v_clean_desc := trim(p_description);

    IF char_length(v_clean_title) < 3 OR char_length(v_clean_title) > 200 THEN
        RAISE EXCEPTION 'Title must be between 3 and 200 characters';
    END IF;

    IF char_length(v_clean_desc) < 10 OR char_length(v_clean_desc) > 5000 THEN
        RAISE EXCEPTION 'Description must be between 10 and 5000 characters';
    END IF;

    IF p_category NOT IN ('feature_request', 'bug_report', 'question_correction', 'general') THEN
        RAISE EXCEPTION 'Invalid feedback category: %', p_category;
    END IF;

    -- 3. Acquire transaction-scoped advisory lock per user UUID
    -- Serializes concurrent submissions for the same user, preventing race conditions across Vercel instances
    PERFORM pg_advisory_xact_lock(hashtext('feedback_rl_' || v_user_id::text));

    -- 4. Shared Database Rate Limiting:
    -- A. Rapid duplicate title suppression (60 seconds)
    IF EXISTS (
        SELECT 1 FROM public.student_feedback
        WHERE user_id = v_user_id
          AND lower(regexp_replace(trim(title), '\s+', ' ', 'g')) = lower(regexp_replace(v_clean_title, '\s+', ' ', 'g'))
          AND created_at > now() - interval '60 seconds'
    ) THEN
        RAISE EXCEPTION 'A submission with this title was already received just now. Please wait a moment before resubmitting.';
    END IF;

    -- B. Short-burst throttle (maximum 3 submissions in 2 minutes)
    SELECT COUNT(*) INTO v_burst_count
    FROM public.student_feedback
    WHERE user_id = v_user_id
      AND created_at > now() - interval '2 minutes';

    IF v_burst_count >= 3 THEN
        RAISE EXCEPTION 'You are submitting feedback too quickly. Please pause for a few minutes.';
    END IF;

    -- C. Hourly limit (maximum 10 submissions in 1 hour)
    SELECT COUNT(*) INTO v_hour_count
    FROM public.student_feedback
    WHERE user_id = v_user_id
      AND created_at > now() - interval '1 hour';

    IF v_hour_count >= 10 THEN
        RAISE EXCEPTION 'You have reached the hourly feedback submission limit (10 items). Please wait before submitting more feedback.';
    END IF;

    -- D. Daily limit (maximum 30 submissions in 24 hours)
    SELECT COUNT(*) INTO v_day_count
    FROM public.student_feedback
    WHERE user_id = v_user_id
      AND created_at > now() - interval '24 hours';

    IF v_day_count >= 30 THEN
        RAISE EXCEPTION 'You have reached the daily feedback submission limit (30 items). Please wait before submitting more feedback.';
    END IF;

    -- 5. Insert feedback record
    INSERT INTO public.student_feedback (
        user_id,
        category,
        title,
        description,
        status,
        resolution_outcome,
        resolution_note,
        subject_id,
        assessment_event_id,
        question_reference,
        page_url,
        metadata
    ) VALUES (
        v_user_id,
        p_category,
        v_clean_title,
        v_clean_desc,
        'new',
        NULL,
        NULL,
        p_subject_id,
        p_assessment_event_id,
        p_question_reference,
        p_page_url,
        '{}'::jsonb
    ) RETURNING id INTO v_feedback_id;

    -- 6. Insert initial status history audit record
    INSERT INTO public.student_feedback_status_history (
        feedback_id,
        changed_by,
        old_status,
        new_status,
        old_outcome,
        new_outcome,
        message
    ) VALUES (
        v_feedback_id,
        v_user_id,
        NULL,
        'new',
        NULL,
        NULL,
        'Feedback submitted by student.'
    );

    RETURN jsonb_build_object(
        'success', true,
        'feedback_id', v_feedback_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_student_feedback_v1(TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_feedback_v1(TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;


