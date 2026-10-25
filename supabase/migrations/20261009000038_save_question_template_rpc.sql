-- Migration: 20261009000038_save_question_template_rpc.sql
-- Description: Provide atomic save_question_template RPC and repair question 7859d861 evaluation mapping

-- 1. Atomic save_question_template RPC
CREATE OR REPLACE FUNCTION public.save_question_template(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
    v_id UUID;
    v_paper_set_id UUID;
    v_section_id UUID;
    v_group_id UUID;
    v_type TEXT;
    v_text TEXT;
    v_marks NUMERIC;
    v_status TEXT;
    v_code_content JSONB;
    v_image_assets JSONB;
    v_options JSONB;
    v_eval_numeric JSONB;
    v_question_id UUID;
    v_next_seq INT;
    v_opt JSONB;
    v_opt_id UUID;
    v_opt_text TEXT;
    v_opt_seq INT;
    v_opt_images JSONB;
    v_is_correct BOOLEAN;
    v_kept_ids UUID[] := ARRAY[]::UUID[];
    v_correct_ids UUID[] := ARRAY[]::UUID[];
    v_existing_eval_correct_ids UUID[];
    v_existing_opt_ids UUID[];
    v_num_mode TEXT;
    v_exact_val NUMERIC;
    v_min_val NUMERIC;
    v_max_val NUMERIC;
BEGIN
    -- Authorization Check: Caller must be authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required';
    END IF;

    -- Authorization Check: Caller must have admin role (fail-closed on NULL or non-admin)
    IF public.get_auth_user_role()::text IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- Extract payload fields
    v_id := (p_payload->>'id')::UUID;
    v_paper_set_id := (p_payload->>'paper_set_id')::UUID;
    v_section_id := (p_payload->>'section_id')::UUID;
    v_group_id := (p_payload->>'group_id')::UUID;
    v_type := p_payload->>'type';
    v_text := pg_catalog.btrim(p_payload->>'text');
    v_marks := (p_payload->>'marks')::NUMERIC;
    v_status := COALESCE(p_payload->>'verification_status', 'Ready');
    v_code_content := p_payload->'code_content';
    v_image_assets := p_payload->'image_assets';
    v_options := p_payload->'options';
    v_eval_numeric := p_payload->'eval_numeric';

    -- Validation
    IF v_text IS NULL OR v_text = '' THEN
        RAISE EXCEPTION 'Question text is required';
    END IF;

    IF v_marks IS NULL OR v_marks <= 0 THEN
        RAISE EXCEPTION 'Marks must be greater than 0';
    END IF;

    IF v_type NOT IN ('MCQ', 'MSQ', 'NUMERICAL') THEN
        RAISE EXCEPTION 'Invalid question type: %', v_type;
    END IF;

    IF v_section_id IS NULL AND v_group_id IS NULL AND v_id IS NULL THEN
        RAISE EXCEPTION 'Question must belong to a section or a group';
    END IF;

    -- Upsert question_templates record
    IF v_id IS NOT NULL THEN
        UPDATE public.question_templates
        SET type = v_type::public.question_type,
            text = v_text,
            marks = v_marks,
            verification_status = v_status::public.verification_status,
            code_content = v_code_content,
            image_assets = v_image_assets
        WHERE id = v_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Question template % not found', v_id;
        END IF;

        v_question_id := v_id;
    ELSE
        INSERT INTO public.question_templates (
            section_id,
            group_id,
            type,
            text,
            marks,
            verification_status,
            code_content,
            image_assets
        ) VALUES (
            v_section_id,
            v_group_id,
            v_type::public.question_type,
            v_text,
            v_marks,
            v_status::public.verification_status,
            v_code_content,
            v_image_assets
        )
        RETURNING id INTO v_question_id;

        IF v_section_id IS NOT NULL THEN
            SELECT COALESCE(pg_catalog.max(sequence), 0) + 1 INTO v_next_seq
            FROM public.section_content_nodes
            WHERE section_id = v_section_id;

            INSERT INTO public.section_content_nodes (
                section_id,
                node_type,
                question_id,
                sequence
            ) VALUES (
                v_section_id,
                'QUESTION'::public.content_node_type,
                v_question_id,
                v_next_seq
            );
        END IF;
    END IF;

    -- Options and Evaluation Reconciliation
    IF v_type IN ('MCQ', 'MSQ') THEN
        DELETE FROM public.eval_numeric_templates WHERE question_id = v_question_id;

        IF v_options IS NULL OR pg_catalog.jsonb_array_length(v_options) < 2 THEN
            RAISE EXCEPTION '% requires at least 2 options', v_type;
        END IF;

        SELECT pg_catalog.array_agg(id) INTO v_existing_opt_ids
        FROM public.option_templates
        WHERE question_id = v_question_id;

        SELECT pg_catalog.array_agg(correct_option_id) INTO v_existing_eval_correct_ids
        FROM public.eval_mcq_msq_templates
        WHERE question_id = v_question_id;

        -- Shift existing options to temporary sequences (10000 + sequence) to prevent unique collision
        UPDATE public.option_templates
        SET sequence = sequence + 10000
        WHERE question_id = v_question_id;

        FOR v_opt_seq IN 1..pg_catalog.jsonb_array_length(v_options) LOOP
            v_opt := v_options->(v_opt_seq - 1);
            v_opt_id := (v_opt->>'id')::UUID;
            v_opt_text := pg_catalog.btrim(COALESCE(v_opt->>'text', ''));
            v_opt_images := v_opt->'image_assets';
            v_is_correct := COALESCE((v_opt->>'is_correct')::BOOLEAN, false);

            IF v_opt_id IS NOT NULL AND v_existing_opt_ids IS NOT NULL AND v_opt_id = ANY(v_existing_opt_ids) THEN
                UPDATE public.option_templates
                SET text = v_opt_text,
                    sequence = v_opt_seq,
                    image_assets = v_opt_images
                WHERE id = v_opt_id;

                v_kept_ids := pg_catalog.array_append(v_kept_ids, v_opt_id);
                IF v_is_correct THEN
                    v_correct_ids := pg_catalog.array_append(v_correct_ids, v_opt_id);
                END IF;
            ELSE
                INSERT INTO public.option_templates (
                    question_id,
                    text,
                    sequence,
                    image_assets
                ) VALUES (
                    v_question_id,
                    v_opt_text,
                    v_opt_seq,
                    v_opt_images
                )
                RETURNING id INTO v_opt_id;

                v_kept_ids := pg_catalog.array_append(v_kept_ids, v_opt_id);
                IF v_is_correct THEN
                    v_correct_ids := pg_catalog.array_append(v_correct_ids, v_opt_id);
                END IF;
            END IF;
        END LOOP;

        -- Delete removed options
        IF v_existing_opt_ids IS NOT NULL THEN
            DELETE FROM public.eval_mcq_msq_templates
            WHERE question_id = v_question_id
              AND correct_option_id != ALL(v_kept_ids);

            DELETE FROM public.option_templates
            WHERE question_id = v_question_id
              AND id != ALL(v_kept_ids);
        END IF;

        IF v_type = 'MCQ' AND pg_catalog.cardinality(v_correct_ids) != 1 THEN
            RAISE EXCEPTION 'MCQ must have exactly 1 correct option selected';
        ELSIF v_type = 'MSQ' AND pg_catalog.cardinality(v_correct_ids) = 0 THEN
            RAISE EXCEPTION 'MSQ must have at least 1 correct option selected';
        END IF;

        DELETE FROM public.eval_mcq_msq_templates
        WHERE question_id = v_question_id
          AND correct_option_id != ALL(v_correct_ids);

        INSERT INTO public.eval_mcq_msq_templates (question_id, correct_option_id)
        SELECT v_question_id, c_id
        FROM pg_catalog.unnest(v_correct_ids) AS c_id
        WHERE NOT EXISTS (
            SELECT 1 FROM public.eval_mcq_msq_templates
            WHERE question_id = v_question_id AND correct_option_id = c_id
        );

    ELSIF v_type = 'NUMERICAL' THEN
        DELETE FROM public.eval_mcq_msq_templates WHERE question_id = v_question_id;
        DELETE FROM public.option_templates WHERE question_id = v_question_id;

        IF v_eval_numeric IS NULL THEN
            RAISE EXCEPTION 'Numerical evaluation configuration is required';
        END IF;

        v_num_mode := v_eval_numeric->>'mode';
        v_exact_val := (v_eval_numeric->>'exact_val')::NUMERIC;
        v_min_val := (v_eval_numeric->>'min_val')::NUMERIC;
        v_max_val := (v_eval_numeric->>'max_val')::NUMERIC;

        IF v_num_mode = 'EXACT' THEN
            IF v_exact_val IS NULL THEN
                RAISE EXCEPTION 'Exact value is required for EXACT mode';
            END IF;
            v_min_val := NULL;
            v_max_val := NULL;
        ELSIF v_num_mode = 'RANGE' THEN
            IF v_min_val IS NULL OR v_max_val IS NULL THEN
                RAISE EXCEPTION 'Min and Max values are required for RANGE mode';
            END IF;
            IF v_min_val > v_max_val THEN
                RAISE EXCEPTION 'Range Min value cannot be greater than Max value';
            END IF;
            v_exact_val := NULL;
        ELSE
            RAISE EXCEPTION 'Invalid numerical evaluation mode: %', v_num_mode;
        END IF;

        INSERT INTO public.eval_numeric_templates (
            question_id,
            mode,
            exact_val,
            min_val,
            max_val
        ) VALUES (
            v_question_id,
            v_num_mode::public.numerical_eval_mode,
            v_exact_val,
            v_min_val,
            v_max_val
        )
        ON CONFLICT (question_id) DO UPDATE SET
            mode = EXCLUDED.mode,
            exact_val = EXCLUDED.exact_val,
            min_val = EXCLUDED.min_val,
            max_val = EXCLUDED.max_val;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'id', v_question_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_question_template(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_template(JSONB) TO authenticated;

-- 2. One-time repair for question 7859d861-ba06-4f72-9532-75e5016fd51d
-- Re-establish Option 3 (k < 4) mapping only if BOTH question and matching option exist
INSERT INTO public.eval_mcq_msq_templates (question_id, correct_option_id)
SELECT q.id, o.id
FROM public.question_templates q
JOIN public.option_templates o ON o.question_id = q.id
WHERE q.id = '7859d861-ba06-4f72-9532-75e5016fd51d'::UUID
  AND o.id = '85d480ae-d1d5-4824-85cd-4aa5521f7772'::UUID
  AND NOT EXISTS (
    SELECT 1 FROM public.eval_mcq_msq_templates m
    WHERE m.question_id = q.id
);

