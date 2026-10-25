-- ==============================================================================
-- 20261008000030_store_max_marks_on_results.sql
-- Store precalculated max_marks on results table to prevent recomputations
-- ==============================================================================

-- 1. Add max_marks column to results table (nullable, no default)
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS max_marks numeric(7,2);

-- 2. Helper function to compute total max marks for a paper_set_version
CREATE OR REPLACE FUNCTION public.paper_max_marks(p_paper_set_version_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(qv.marks), 0.0)
  FROM public.question_versions qv
  WHERE qv.section_version_id IN (
    SELECT sv.id FROM public.section_versions sv WHERE sv.paper_set_version_id = p_paper_set_version_id
  )
  OR qv.group_version_id IN (
    SELECT gv.id
    FROM public.group_versions gv
    JOIN public.section_versions sv ON gv.section_version_id = sv.id
    WHERE sv.paper_set_version_id = p_paper_set_version_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.paper_max_marks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paper_max_marks(uuid) TO service_role, postgres;

-- 3. Update evaluate_and_finalize_attempt to store max_marks on result insert/update
CREATE OR REPLACE FUNCTION public.evaluate_and_finalize_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    INSERT INTO results (attempt_id, score, max_marks, status, evaluated_at)
    VALUES (
        p_attempt_id, 
        v_total_score, 
        public.paper_max_marks(v_attempt.paper_set_version_id), 
        'Pending Review', 
        NOW()
    )
    ON CONFLICT (attempt_id) DO UPDATE 
    SET score = EXCLUDED.score, 
        max_marks = EXCLUDED.max_marks,
        evaluated_at = EXCLUDED.evaluated_at;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) TO service_role;

-- 4. Idempotent backfill of max_marks for existing results
UPDATE public.results r
SET max_marks = public.paper_max_marks(a.paper_set_version_id)
FROM public.attempts a
WHERE a.id = r.attempt_id
  AND r.max_marks IS NULL;
