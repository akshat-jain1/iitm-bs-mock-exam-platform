-- Migration: 20261009000039_fix_evaluate_and_finalize_attempt_status.sql
-- Description: Harden evaluate_and_finalize_attempt RPC with empty search_path,
--              record 'Evaluated' when all paper questions have type-specific verified answer keys,
--              retain 'Pending Review' if any required answer keys are missing,
--              and perform a historical status-only backfill from 'Pending Review' to 'Evaluated' for test attempts only (is_test = true).

-- 1. Update evaluate_and_finalize_attempt RPC
CREATE OR REPLACE FUNCTION public.evaluate_and_finalize_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempt RECORD;
    v_total_score NUMERIC(7,2) := 0.0;
    v_has_missing_keys BOOLEAN := false;
    v_result_status TEXT := 'Evaluated';
BEGIN
    -- 1. Lock and update attempt
    UPDATE public.attempts
    SET status = 'Completed', end_time = pg_catalog.now()
    WHERE id = p_attempt_id AND status = 'Live'
    RETURNING * INTO v_attempt;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found or already completed.';
    END IF;

    -- 2. Detect if any questions in the paper version lack verified answer keys for their specific type
    SELECT EXISTS (
        SELECT 1
        FROM public.question_versions qv
        WHERE (
            qv.section_version_id IN (
                SELECT sv.id FROM public.section_versions sv WHERE sv.paper_set_version_id = v_attempt.paper_set_version_id
            )
            OR qv.group_version_id IN (
                SELECT gv.id FROM public.group_versions gv
                JOIN public.section_versions sv ON gv.section_version_id = sv.id
                WHERE sv.paper_set_version_id = v_attempt.paper_set_version_id
            )
        )
        AND (
            (qv.type = 'MCQ' AND (
                SELECT COUNT(*) FROM public.eval_mcq_msq_versions eval WHERE eval.question_version_id = qv.id
            ) != 1)
            OR
            (qv.type = 'MSQ' AND (
                SELECT COUNT(*) FROM public.eval_mcq_msq_versions eval WHERE eval.question_version_id = qv.id
            ) < 2)
            OR
            (qv.type = 'NUMERICAL' AND NOT EXISTS (
                SELECT 1 FROM public.eval_numeric_versions eval_num WHERE eval_num.question_version_id = qv.id
            ))
            OR
            (qv.type NOT IN ('MCQ', 'MSQ', 'NUMERICAL'))
        )
    ) INTO v_has_missing_keys;

    IF v_has_missing_keys THEN
        v_result_status := 'Pending Review';
    ELSE
        v_result_status := 'Evaluated';
    END IF;

    -- 3. Calculate score
    SELECT COALESCE(SUM(q_score), 0.0) INTO v_total_score
    FROM (
        SELECT
            r.question_version_id,
            qv.type,
            qv.marks,
            r.data,
            CASE
                -- MCQ Evaluation
                WHEN qv.type = 'MCQ' THEN
                    (SELECT CASE WHEN r.data->>'selected_option_id' = eval.correct_option_version_id::text THEN qv.marks ELSE 0.0 END
                     FROM public.eval_mcq_msq_versions eval
                     WHERE eval.question_version_id = qv.id LIMIT 1)

                -- MSQ Evaluation
                WHEN qv.type = 'MSQ' THEN
                    (SELECT CASE
                        WHEN (
                            (r.data->'selected_option_ids') @> (pg_catalog.jsonb_agg(pg_catalog.to_jsonb(eval.correct_option_version_id::text)))
                            AND
                            (pg_catalog.jsonb_agg(pg_catalog.to_jsonb(eval.correct_option_version_id::text))) @> (r.data->'selected_option_ids')
                        ) THEN qv.marks ELSE 0.0 END
                     FROM public.eval_mcq_msq_versions eval
                     WHERE eval.question_version_id = qv.id)

                -- Numerical Evaluation
                WHEN qv.type = 'NUMERICAL' THEN
                    (SELECT CASE
                        WHEN eval.mode = 'EXACT' AND (r.data->>'value')::NUMERIC = eval.exact_val THEN qv.marks
                        WHEN eval.mode = 'RANGE' AND (r.data->>'value')::NUMERIC >= eval.min_val AND (r.data->>'value')::NUMERIC <= eval.max_val THEN qv.marks
                        ELSE 0.0 END
                     FROM public.eval_numeric_versions eval
                     WHERE eval.question_version_id = qv.id LIMIT 1)

                ELSE 0.0
            END AS q_score
        FROM public.responses r
        JOIN public.question_versions qv ON r.question_version_id = qv.id
        WHERE r.attempt_id = p_attempt_id AND r.data IS NOT NULL
    ) AS scored_responses;

    -- 4. Persist Result (Idempotent: updates score, max_marks, status, and evaluated_at on conflict)
    INSERT INTO public.results (attempt_id, score, max_marks, status, evaluated_at)
    VALUES (
        p_attempt_id,
        v_total_score,
        public.paper_max_marks(v_attempt.paper_set_version_id),
        v_result_status,
        pg_catalog.now()
    )
    ON CONFLICT (attempt_id) DO UPDATE
    SET score = EXCLUDED.score,
        max_marks = EXCLUDED.max_marks,
        status = EXCLUDED.status,
        evaluated_at = EXCLUDED.evaluated_at;

END;
$$;

-- 2. Maintain strict service-role permissions
REVOKE EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) TO service_role;

-- 3. Historical status-only backfill for test attempts
-- Updates results.status from 'Pending Review' to 'Evaluated' for test attempts only (attempts.is_test = true).
-- Strictly preserves scores, maximum marks, evaluation timestamps, student responses, attempts, and published paper versions.
UPDATE public.results r
SET status = 'Evaluated'
FROM public.attempts a
WHERE r.attempt_id = a.id
  AND r.status = 'Pending Review'
  AND a.is_test = true;
