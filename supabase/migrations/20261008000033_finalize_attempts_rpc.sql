-- Migration: 20261008000033_finalize_attempts_rpc.sql
-- Description: Batch finalize and evaluate multiple live attempts in one transaction

CREATE OR REPLACE FUNCTION public.finalize_attempts(
    p_student_id UUID,
    p_attempt_ids UUID[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempt_id UUID;
    v_attempt RECORD;
    v_finalized_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    -- 1. Parameter validation
    IF p_student_id IS NULL OR p_attempt_ids IS NULL 
       OR pg_catalog.cardinality(p_attempt_ids) = 0 
       OR pg_catalog.cardinality(p_attempt_ids) > 10 THEN
        RAISE EXCEPTION 'Invalid parameters';
    END IF;

    -- 2. Validate all attempts belong to student first (IS DISTINCT FROM)
    FOREACH v_attempt_id IN ARRAY p_attempt_ids LOOP
        SELECT a.id, a.student_id, a.status
        INTO v_attempt
        FROM public.attempts a
        WHERE a.id = v_attempt_id
        FOR UPDATE;

        IF NOT FOUND OR v_attempt.student_id IS DISTINCT FROM p_student_id THEN
            RAISE EXCEPTION 'Unauthorized or invalid attempt: %', v_attempt_id;
        END IF;

        IF v_attempt.status = 'Completed' THEN
            v_skipped_count := v_skipped_count + 1;
        ELSIF v_attempt.status = 'Live' THEN
            PERFORM public.evaluate_and_finalize_attempt(v_attempt_id);
            v_finalized_count := v_finalized_count + 1;
        ELSE
            RAISE EXCEPTION 'Invalid attempt status for attempt %: %', v_attempt_id, v_attempt.status;
        END IF;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'finalized_count', v_finalized_count,
        'skipped_count', v_skipped_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_attempts(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_attempts(UUID, UUID[]) TO service_role;
