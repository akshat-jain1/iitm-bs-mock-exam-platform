-- Migration: 20261008000032_fix_save_response_and_triggers.sql
-- Description: Fix trigger verify_response_question_version with schema-qualified names and fix save_response question_type enum check

-- 1. Fix trigger function verify_response_question_version with fully qualified names and empty search_path
CREATE OR REPLACE FUNCTION public.verify_response_question_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_attempt_paper_version UUID;
    q_paper_version UUID;
BEGIN
    SELECT paper_set_version_id INTO v_attempt_paper_version 
    FROM public.attempts 
    WHERE id = NEW.attempt_id;
    
    SELECT COALESCE(s.paper_set_version_id, gs.paper_set_version_id) INTO q_paper_version
    FROM public.question_versions q
    LEFT JOIN public.section_versions s ON q.section_version_id = s.id
    LEFT JOIN public.group_versions g ON q.group_version_id = g.id
    LEFT JOIN public.section_versions gs ON g.section_version_id = gs.id
    WHERE q.id = NEW.question_version_id;

    IF v_attempt_paper_version != q_paper_version THEN
        RAISE EXCEPTION 'Question Version does not belong to the Attempt Paper Version';
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Fix save_response with v_question.type::text = 'NUMERICAL'
CREATE OR REPLACE FUNCTION public.save_response(
    p_student_id UUID,
    p_attempt_id UUID,
    p_question_version_id UUID,
    p_data JSONB,
    p_marked BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempt RECORD;
    v_question RECORD;
    v_arr_len INTEGER;
    v_unique_count INTEGER;
    v_matching_opts_count INTEGER;
    v_num_text TEXT;
BEGIN
    -- 0. Immediate guard for student identity
    IF p_student_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized or invalid attempt';
    END IF;

    -- Normalise JSON null: clearing an answer works however PostgREST passes null
    IF p_data IS NOT NULL AND pg_catalog.jsonb_typeof(p_data) = 'null' THEN
        p_data := NULL;
    END IF;

    -- 1. Verify attempt exists, belongs to student, and is Live
    SELECT
        a.student_id,
        a.status,
        a.paper_set_version_id
    INTO v_attempt
    FROM public.attempts a
    WHERE a.id = p_attempt_id;

    IF NOT FOUND OR v_attempt.student_id IS DISTINCT FROM p_student_id THEN
        RAISE EXCEPTION 'Unauthorized or invalid attempt';
    END IF;

    IF v_attempt.status IS DISTINCT FROM 'Live' THEN
        RAISE EXCEPTION 'Attempt is not Live';
    END IF;

    -- 2. Verify question version exists and belongs to attempt's paper_set_version_id
    SELECT
        q.type,
        COALESCE(s.paper_set_version_id, gs.paper_set_version_id) AS paper_set_version_id
    INTO v_question
    FROM public.question_versions q
    LEFT JOIN public.section_versions s ON q.section_version_id = s.id
    LEFT JOIN public.group_versions g ON q.group_version_id = g.id
    LEFT JOIN public.section_versions gs ON g.section_version_id = gs.id
    WHERE q.id = p_question_version_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found';
    END IF;

    IF v_question.paper_set_version_id IS NULL OR v_question.paper_set_version_id IS DISTINCT FROM v_attempt.paper_set_version_id THEN
        RAISE EXCEPTION 'Question Version does not belong to the Attempt Paper Version';
    END IF;

    -- 3. Validate response data payload if provided
    IF p_data IS NOT NULL THEN
        -- Payload must be a JSON object, not an array or scalar
        IF pg_catalog.jsonb_typeof(p_data) != 'object' THEN
            RAISE EXCEPTION 'Invalid response format: must be an object';
        END IF;

        IF v_question.type = 'MCQ' THEN
            -- Only key allowed: 'selected_option_id'
            IF NOT (p_data ? 'selected_option_id') OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_data)) != 1 THEN
                RAISE EXCEPTION 'Invalid MCQ format';
            END IF;

            -- Value must be a valid string UUID
            IF pg_catalog.jsonb_typeof(p_data->'selected_option_id') != 'string'
               OR (p_data->>'selected_option_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                RAISE EXCEPTION 'Invalid option ID';
            END IF;

            -- Option must exist in option_versions for this question_version_id
            IF NOT EXISTS (
                SELECT 1
                FROM public.option_versions ov
                WHERE ov.id = (p_data->>'selected_option_id')::uuid
                  AND ov.question_version_id = p_question_version_id
            ) THEN
                RAISE EXCEPTION 'Option does not exist for this question';
            END IF;

        ELSIF v_question.type = 'MSQ' THEN
            -- Only key allowed: 'selected_option_ids'
            IF NOT (p_data ? 'selected_option_ids') OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_data)) != 1 THEN
                RAISE EXCEPTION 'Invalid MSQ format';
            END IF;

            -- Value must be an array
            IF pg_catalog.jsonb_typeof(p_data->'selected_option_ids') != 'array' THEN
                RAISE EXCEPTION 'Invalid MSQ format';
            END IF;

            v_arr_len := pg_catalog.jsonb_array_length(p_data->'selected_option_ids');

            -- Duplicate check
            SELECT pg_catalog.count(DISTINCT elem) INTO v_unique_count
            FROM pg_catalog.jsonb_array_elements(p_data->'selected_option_ids') AS elem;

            IF v_unique_count != v_arr_len THEN
                RAISE EXCEPTION 'Duplicate options in MSQ';
            END IF;

            -- Each element must be a valid string UUID
            IF EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_array_elements(p_data->'selected_option_ids') AS elem
                WHERE pg_catalog.jsonb_typeof(elem) != 'string'
                   OR (elem #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            ) THEN
                RAISE EXCEPTION 'Invalid UUID in MSQ';
            END IF;

            -- All options must exist in option_versions for this question
            IF v_arr_len > 0 THEN
                SELECT pg_catalog.count(*) INTO v_matching_opts_count
                FROM public.option_versions ov
                WHERE ov.question_version_id = p_question_version_id
                  AND ov.id IN (
                      SELECT (elem #>> '{}')::uuid
                      FROM pg_catalog.jsonb_array_elements(p_data->'selected_option_ids') AS elem
                  );

                IF v_matching_opts_count != v_arr_len THEN
                    RAISE EXCEPTION 'One or more options do not exist for this question';
                END IF;
            END IF;

        ELSIF v_question.type::text = 'NUMERICAL' THEN
            -- Only key allowed: 'value'
            IF NOT (p_data ? 'value') OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_data)) != 1 THEN
                RAISE EXCEPTION 'Invalid Numerical format';
            END IF;

            -- Value must be number or string
            IF pg_catalog.jsonb_typeof(p_data->'value') NOT IN ('number', 'string') THEN
                RAISE EXCEPTION 'Invalid numerical value';
            END IF;

            v_num_text := pg_catalog.btrim(p_data->>'value');

            -- Trimmed value must match finite number pattern
            IF v_num_text !~* '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' THEN
                RAISE EXCEPTION 'Invalid numerical value';
            END IF;

            -- Normalize to numeric JSON value (same as TS payload.value = val)
            p_data := pg_catalog.jsonb_build_object('value', v_num_text::numeric);

        ELSE
            RAISE EXCEPTION 'Unsupported question type';
        END IF;
    END IF;

    -- 4. Upsert or Delete
    IF p_data IS NULL AND (p_marked IS FALSE OR p_marked IS NULL) THEN
        DELETE FROM public.responses
        WHERE attempt_id = p_attempt_id
          AND question_version_id = p_question_version_id;
    ELSE
        INSERT INTO public.responses (
            attempt_id,
            question_version_id,
            data,
            marked_for_review,
            last_saved_at
        ) VALUES (
            p_attempt_id,
            p_question_version_id,
            p_data,
            COALESCE(p_marked, false),
            pg_catalog.now()
        )
        ON CONFLICT (attempt_id, question_version_id)
        DO UPDATE SET
            data = EXCLUDED.data,
            marked_for_review = EXCLUDED.marked_for_review,
            last_saved_at = pg_catalog.now();
    END IF;
END;
$$;

-- Security hardening
REVOKE EXECUTE ON FUNCTION public.save_response(UUID, UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_response(UUID, UUID, UUID, JSONB, BOOLEAN) TO service_role;
