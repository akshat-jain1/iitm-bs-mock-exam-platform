-- Migration: 20261009000037_enforce_active_session_consistency.sql
-- Description: Enforce active-session consistency and atomic resumption inside start_student_attempts RPC

CREATE OR REPLACE FUNCTION public.start_student_attempts(
    p_assessment_id UUID,
    p_assessment_subject_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_email_norm TEXT;
    v_assessment RECORD;
    v_as RECORD;
    v_as_id UUID;
    v_distinct_subject_count INTEGER;
    v_requires_enrollment BOOLEAN;
    v_enrolled BOOLEAN;
    v_current_attempt RECORD;
    v_existing_count INTEGER;
    v_next_attempt_number INTEGER;
    v_attempt_ids UUID[] := ARRAY[]::UUID[];
    v_new_attempt_id UUID;
    v_lock_key BIGINT;
    v_live_start_time_count INTEGER;
    v_existing_live_as_ids UUID[];
    v_sorted_requested_as_ids UUID[];
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required';
    END IF;

    SELECT role::text, email INTO v_caller_role, v_caller_email
    FROM public.users
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User record not found';
    END IF;

    IF v_caller_email IS NULL THEN
        SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
    END IF;

    v_email_norm := pg_catalog.lower(pg_catalog.btrim(v_caller_email));
    IF v_email_norm IS NULL 
       OR (pg_catalog.length(v_email_norm) - pg_catalog.length(pg_catalog.replace(v_email_norm, '@', ''))) != 1
       OR pg_catalog.split_part(v_email_norm, '@', 1) = ''
       OR pg_catalog.split_part(v_email_norm, '@', 2) != 'sst.scaler.com' THEN
        RAISE EXCEPTION 'Unauthorized: Access restricted to @sst.scaler.com email addresses';
    END IF;

    IF p_assessment_id IS NULL 
       OR p_assessment_subject_ids IS NULL 
       OR pg_catalog.cardinality(p_assessment_subject_ids) = 0 THEN
        RAISE EXCEPTION 'Invalid parameters: assessment and subjects required';
    END IF;

    IF pg_catalog.cardinality(p_assessment_subject_ids) > 4 THEN
        RAISE EXCEPTION 'Cannot select more than 4 subjects for an assessment';
    END IF;

    SELECT pg_catalog.count(DISTINCT elem)::integer INTO v_distinct_subject_count
    FROM pg_catalog.unnest(p_assessment_subject_ids) AS elem;

    IF v_distinct_subject_count != pg_catalog.cardinality(p_assessment_subject_ids) THEN
        RAISE EXCEPTION 'Duplicate subject selection detected';
    END IF;

    SELECT 
        id, 
        status, 
        assignment_type, 
        test_access_mode, 
        test_attempt_policy, 
        test_max_attempts
    INTO v_assessment
    FROM public.assessment_events
    WHERE id = p_assessment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment event not found';
    END IF;

    IF v_assessment.status != 'Live' THEN
        RAISE EXCEPTION 'Assessment is not Live';
    END IF;

    IF v_assessment.assignment_type = 'PRODUCTION' THEN
        IF v_caller_role = 'admin' THEN
            RAISE EXCEPTION 'Admins cannot start production assessments. Use a TEST assignment to verify papers.';
        END IF;
        IF v_caller_role NOT IN ('student', 'tester') THEN
            RAISE EXCEPTION 'Unauthorized role for production assessment: %', v_caller_role;
        END IF;
    ELSIF v_assessment.assignment_type = 'TEST' THEN
        IF v_assessment.test_access_mode = 'TESTER_ONLY' THEN
            IF v_caller_role NOT IN ('tester', 'admin') THEN
                RAISE EXCEPTION 'Access denied: This test assignment is restricted to testers';
            END IF;
        ELSIF v_assessment.test_access_mode = 'ALL_ENROLLED' THEN
            IF v_caller_role NOT IN ('student', 'tester', 'admin') THEN
                RAISE EXCEPTION 'Unauthorized role: %', v_caller_role;
            END IF;
        END IF;
    END IF;

    -- Advisory Transaction Lock scoped to student + assessment event
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(v_caller_id::text || ':' || p_assessment_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    v_requires_enrollment := (
        v_assessment.assignment_type = 'PRODUCTION' OR
        (v_assessment.assignment_type = 'TEST' AND v_assessment.test_access_mode = 'ALL_ENROLLED' AND v_caller_role != 'admin')
    );

    -- Validate all requested subjects belong to this assessment and meet enrollment / paper requirements
    FOR v_as_id IN SELECT pg_catalog.unnest(p_assessment_subject_ids) LOOP
        SELECT id, subject_id, paper_set_version_id
        INTO v_as
        FROM public.assessment_subjects
        WHERE id = v_as_id AND assessment_event_id = p_assessment_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Assessment subject % does not belong to this assessment', v_as_id;
        END IF;

        IF v_as.paper_set_version_id IS NULL THEN
            RAISE EXCEPTION 'Assessment subject % does not have a published paper assigned', v_as_id;
        END IF;

        IF v_requires_enrollment THEN
            SELECT EXISTS (
                SELECT 1 
                FROM public.student_enrollments
                WHERE student_id = v_caller_id 
                  AND subject_id = v_as.subject_id 
                  AND is_active = true
            ) INTO v_enrolled;

            IF NOT v_enrolled THEN
                RAISE EXCEPTION 'Student is not actively enrolled in subject for assessment_subject %', v_as_id;
            END IF;
        END IF;
    END LOOP;

    -- Enforce Active-Session Consistency (Under Advisory Lock, Before Any Insert)
    SELECT 
        pg_catalog.count(DISTINCT a.start_time)::integer,
        pg_catalog.array_agg(a.assessment_subject_id ORDER BY a.assessment_subject_id)
    INTO v_live_start_time_count, v_existing_live_as_ids
    FROM public.attempts a
    JOIN public.assessment_subjects asub ON asub.id = a.assessment_subject_id
    WHERE a.student_id = v_caller_id
      AND a.status = 'Live'
      AND asub.assessment_event_id = p_assessment_id;

    IF v_existing_live_as_ids IS NOT NULL THEN
        -- 1. Reject if existing Live attempts already span multiple distinct start times
        IF v_live_start_time_count > 1 THEN
            RAISE EXCEPTION 'Active attempts belong to multiple distinct sessions. Please complete or exit them individually.';
        END IF;

        -- 2. Sort requested subjects for exact comparison with existing Live session
        SELECT pg_catalog.array_agg(elem ORDER BY elem)
        INTO v_sorted_requested_as_ids
        FROM pg_catalog.unnest(p_assessment_subject_ids) AS elem;

        -- 3. Enforce exact match: requested subjects must match active Live session exactly
        IF v_sorted_requested_as_ids != v_existing_live_as_ids THEN
            IF v_sorted_requested_as_ids && v_existing_live_as_ids THEN
                RAISE EXCEPTION 'Cannot combine an active test session with different subjects. Please resume your exact active session or complete it first.';
            ELSE
                RAISE EXCEPTION 'An active test session is already in progress. Please complete or exit your active session before starting a new one.';
            END IF;
        END IF;
    END IF;

    -- Resume existing Live attempts OR create new attempts for the session
    FOR v_as_id IN SELECT pg_catalog.unnest(p_assessment_subject_ids) LOOP
        SELECT id, subject_id, paper_set_version_id
        INTO v_as
        FROM public.assessment_subjects
        WHERE id = v_as_id;

        SELECT id, attempt_number, status, is_test, paper_set_version_id
        INTO v_current_attempt
        FROM public.attempts
        WHERE student_id = v_caller_id
          AND assessment_subject_id = v_as_id
          AND status = 'Live'
        LIMIT 1;

        IF FOUND THEN
            IF v_current_attempt.is_test != (v_assessment.assignment_type = 'TEST') THEN
                RAISE EXCEPTION 'Security conflict: Live attempt test status does not match current assessment type';
            END IF;

            IF v_current_attempt.paper_set_version_id != v_as.paper_set_version_id THEN
                RAISE EXCEPTION 'Security conflict: Live attempt paper version does not match published paper version';
            END IF;

            v_attempt_ids := pg_catalog.array_append(v_attempt_ids, v_current_attempt.id);
        ELSE
            IF v_assessment.assignment_type = 'PRODUCTION' THEN
                IF EXISTS (
                    SELECT 1 
                    FROM public.attempts 
                    WHERE student_id = v_caller_id 
                      AND assessment_subject_id = v_as_id
                ) THEN
                    RAISE EXCEPTION 'Production assessment already attempted. Retakes are not allowed.';
                END IF;

                v_next_attempt_number := 1;
            ELSE
                SELECT pg_catalog.count(*)::integer, COALESCE(pg_catalog.max(attempt_number), 0) + 1
                INTO v_existing_count, v_next_attempt_number
                FROM public.attempts
                WHERE student_id = v_caller_id
                  AND assessment_subject_id = v_as_id;

                IF v_assessment.test_attempt_policy = 'LIMITED' THEN
                    IF v_existing_count >= v_assessment.test_max_attempts THEN
                        RAISE EXCEPTION 'Maximum test attempts (%) reached for this subject', v_assessment.test_max_attempts;
                    END IF;
                END IF;
            END IF;

            INSERT INTO public.attempts (
                student_id,
                assessment_subject_id,
                paper_set_version_id,
                attempt_number,
                is_test,
                status,
                start_time
            ) VALUES (
                v_caller_id,
                v_as_id,
                v_as.paper_set_version_id,
                v_next_attempt_number,
                (v_assessment.assignment_type = 'TEST'),
                'Live',
                pg_catalog.now()
            )
            RETURNING id INTO v_new_attempt_id;

            v_attempt_ids := pg_catalog.array_append(v_attempt_ids, v_new_attempt_id);
        END IF;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'student_id', v_caller_id,
        'attempt_ids', v_attempt_ids,
        'is_test', (v_assessment.assignment_type = 'TEST')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_student_attempts(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_student_attempts(UUID, UUID[]) TO authenticated;
