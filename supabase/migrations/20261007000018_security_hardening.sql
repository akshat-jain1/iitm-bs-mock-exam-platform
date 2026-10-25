-- ==============================================================================
-- 20261007000018_security_hardening.sql
-- Security Hardening, Search Path Locking & Index Optimization
-- ==============================================================================

-- 1. Harden evaluate_and_finalize_attempt search_path
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
    INSERT INTO results (attempt_id, score, status, evaluated_at)
    VALUES (p_attempt_id, v_total_score, 'Pending Review', NOW())
    ON CONFLICT (attempt_id) DO UPDATE 
    SET score = EXCLUDED.score, 
        evaluated_at = EXCLUDED.evaluated_at;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) TO service_role;

-- 2. Harden delete_results_demo_paper_versions search_path
CREATE OR REPLACE FUNCTION public.delete_results_demo_paper_versions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Nullify references in assessment_subjects
  UPDATE public.assessment_subjects
  SET paper_set_version_id = NULL
  WHERE paper_set_version_id IN (
    SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
  );

  -- 2. Nullify references in attempts
  UPDATE public.attempts
  SET paper_set_version_id = NULL
  WHERE paper_set_version_id IN (
    SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
  );

  -- 3. Cascade delete child version hierarchy
  DELETE FROM public.section_content_node_versions
  WHERE section_version_id IN (
    SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
      SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
    )
  );

  DELETE FROM public.eval_mcq_msq_versions
  WHERE question_version_id IN (
    SELECT id FROM public.question_versions WHERE section_version_id IN (
      SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
        SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
      )
    )
  );

  DELETE FROM public.eval_numeric_versions
  WHERE question_version_id IN (
    SELECT id FROM public.question_versions WHERE section_version_id IN (
      SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
        SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
      )
    )
  );

  DELETE FROM public.option_versions
  WHERE question_version_id IN (
    SELECT id FROM public.question_versions WHERE section_version_id IN (
      SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
        SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
      )
    )
  );

  DELETE FROM public.question_versions
  WHERE section_version_id IN (
    SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
      SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
    )
  );

  DELETE FROM public.group_versions
  WHERE section_version_id IN (
    SELECT id FROM public.section_versions WHERE paper_set_version_id IN (
      SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
    )
  );

  DELETE FROM public.section_versions
  WHERE paper_set_version_id IN (
    SELECT id FROM public.paper_set_versions WHERE title LIKE '%Results Demo%'
  );

  -- 4. Delete the paper versions themselves
  DELETE FROM public.paper_set_versions
  WHERE title LIKE '%Results Demo%';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_results_demo_paper_versions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_results_demo_paper_versions() TO service_role;

-- 3. Revoke anonymous RPC execution on admin-privileged routines
REVOKE EXECUTE ON FUNCTION public.publish_paper_set_template(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_paper_set_template(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_paper_for_publishing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_paper_for_publishing(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_student_attempt_restrictions() FROM PUBLIC, anon, authenticated;

-- 4. Add targeted performance indexes
CREATE INDEX IF NOT EXISTS idx_assessment_events_status ON public.assessment_events USING btree (status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON public.attempts USING btree (student_id, status);
