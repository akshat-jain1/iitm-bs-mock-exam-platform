-- ==============================================================================
-- 20260927000005_evaluation_rpc.sql
-- Transactional Attempt Finalization & Evaluation
-- ==============================================================================

CREATE OR REPLACE FUNCTION evaluate_and_finalize_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt record;
    v_total_score NUMERIC(7,2) := 0.0;
BEGIN
    -- 1. Lock and update attempt
    UPDATE attempts 
    SET status = 'Completed', end_time = NOW()
    WHERE id = p_attempt_id AND status = 'Live'
    RETURNING * INTO v_attempt;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found or already completed.';
    END IF;

    -- 2. Calculate score
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
                     FROM eval_mcq_msq_versions eval 
                     WHERE eval.question_version_id = qv.id LIMIT 1)

                -- MSQ Evaluation
                WHEN qv.type = 'MSQ' THEN
                    (SELECT CASE 
                        WHEN (
                            (r.data->'selected_option_ids') @> (jsonb_agg(to_jsonb(eval.correct_option_version_id::text))) 
                            AND 
                            (jsonb_agg(to_jsonb(eval.correct_option_version_id::text))) @> (r.data->'selected_option_ids')
                        ) THEN qv.marks ELSE 0.0 END
                     FROM eval_mcq_msq_versions eval 
                     WHERE eval.question_version_id = qv.id)

                -- Numerical Evaluation
                WHEN qv.type = 'NUMERICAL' THEN
                    (SELECT CASE 
                        WHEN eval.mode = 'EXACT' AND (r.data->>'value')::NUMERIC = eval.exact_val THEN qv.marks
                        WHEN eval.mode = 'RANGE' AND (r.data->>'value')::NUMERIC >= eval.min_val AND (r.data->>'value')::NUMERIC <= eval.max_val THEN qv.marks
                        ELSE 0.0 END
                     FROM eval_numeric_versions eval 
                     WHERE eval.question_version_id = qv.id LIMIT 1)
                
                ELSE 0.0
            END AS q_score
        FROM responses r
        JOIN question_versions qv ON r.question_version_id = qv.id
        WHERE r.attempt_id = p_attempt_id AND r.data IS NOT NULL
    ) AS scored_responses;

    -- 3. Persist Result (Idempotent)
    INSERT INTO results (attempt_id, score, status, evaluated_at)
    VALUES (p_attempt_id, v_total_score, 'Pending Review', NOW())
    ON CONFLICT (attempt_id) DO UPDATE 
    SET score = EXCLUDED.score, 
        evaluated_at = EXCLUDED.evaluated_at;

END;
$$;

REVOKE EXECUTE ON FUNCTION evaluate_and_finalize_attempt(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION evaluate_and_finalize_attempt(UUID) TO service_role;
