-- ==============================================================================
-- 20261012000041_harden_rpc_permissions.sql
-- Harden Database RPC Permissions and Revert Over-Permissive Default Routine Grants
-- ==============================================================================
-- 1. Protects paper publishing (publish_paper_set_template):
--    - Fails closed on unauthenticated or non-admin callers using IS DISTINCT FROM 'admin'
--    - Explicitly allows service_role and verified authenticated administrators
--    - Preserves immutable versioning, cloning, and mapping behavior
--
-- 2. Protects paper validation (validate_paper_for_publishing):
--    - Introduces fail-closed administrator check to prevent unauthorized schema/template inspection
--    - Preserves all validation rules and descriptive error messages
--
-- 3. Restricts check_exam_asset_access:
--    - Revokes execute from PUBLIC, anon, and authenticated
--    - Grants execute only to service_role (used by server route /api/assets)
--
-- 4. Re-secures functions regranted by migration 21:
--    - delete_results_demo_paper_versions: restricted to service_role
--    - enforce_student_attempt_restrictions: revoked from PUBLIC, anon, authenticated
--    - evaluate_and_finalize_attempt: restricted to service_role
--
-- 5. Corrects risky routine default privileges from migration 21:
--    - Revokes default routine execute grants to anon and authenticated in schema public
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Revert risky default routine execution privileges in schema public
-- ------------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Harden publish_paper_set_template (Fail-Closed Auth & Least-Privilege Grants)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_paper_set_template(
    p_paper_set_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_template RECORD;
    v_new_paper_version_id UUID;
    v_sec RECORD;
    v_new_sec_version_id UUID;
    v_grp RECORD;
    v_new_grp_version_id UUID;
    v_q RECORD;
    v_new_q_version_id UUID;
    v_node RECORD;
    v_opt RECORD;
    v_new_opt_version_id UUID;
    v_mcq RECORD;
    v_num RECORD;
    v_sec_count INT;
BEGIN
    -- 1. Identity & Role Verification (fail-closed)
    IF (auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Unauthorized: Authentication required';
        END IF;

        IF public.get_auth_user_role()::text IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Unauthorized: Only admins can publish paper set templates';
        END IF;
    END IF;

    -- 2. Check at least 1 section exists
    SELECT COUNT(*) INTO v_sec_count
    FROM public.section_templates
    WHERE paper_set_id = p_paper_set_id;

    IF v_sec_count = 0 THEN
        RAISE EXCEPTION 'Validation Failed: Paper has no sections';
    END IF;

    -- 3. Validate paper before publishing
    PERFORM public.validate_paper_for_publishing(p_paper_set_id);

    -- 4. Fetch paper template
    SELECT * INTO v_template FROM public.paper_set_templates WHERE id = p_paper_set_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paper template not found';
    END IF;

    -- 5. Setup mapping tables
    CREATE TEMP TABLE IF NOT EXISTS pg_temp._id_map_sections (template_id UUID PRIMARY KEY, version_id UUID);
    TRUNCATE pg_temp._id_map_sections;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp._id_map_groups (template_id UUID PRIMARY KEY, version_id UUID);
    TRUNCATE pg_temp._id_map_groups;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp._id_map_questions (template_id UUID PRIMARY KEY, version_id UUID);
    TRUNCATE pg_temp._id_map_questions;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp._id_map_options (template_id UUID PRIMARY KEY, version_id UUID);
    TRUNCATE pg_temp._id_map_options;

    -- 6. Insert into paper_set_versions
    INSERT INTO public.paper_set_versions (
        cloned_from_id,
        subject_id,
        assessment_type_id,
        title,
        reference_material
    ) VALUES (
        v_template.id,
        v_template.subject_id,
        v_template.assessment_type_id,
        v_template.title,
        v_template.reference_material
    ) RETURNING id INTO v_new_paper_version_id;

    -- 7. Clone sections
    FOR v_sec IN SELECT * FROM public.section_templates WHERE paper_set_id = p_paper_set_id LOOP
        INSERT INTO public.section_versions (
            cloned_from_id,
            paper_set_version_id,
            title,
            reference_material
        ) VALUES (
            v_sec.id,
            v_new_paper_version_id,
            v_sec.title,
            v_sec.reference_material
        ) RETURNING id INTO v_new_sec_version_id;

        INSERT INTO pg_temp._id_map_sections (template_id, version_id) VALUES (v_sec.id, v_new_sec_version_id);

        -- Clone groups in this section
        FOR v_grp IN SELECT * FROM public.group_templates WHERE section_id = v_sec.id LOOP
            INSERT INTO public.group_versions (
                cloned_from_id,
                section_version_id,
                title,
                passage,
                image_assets,
                code_content,
                reference_material
            ) VALUES (
                v_grp.id,
                v_new_sec_version_id,
                v_grp.title,
                v_grp.passage,
                v_grp.image_assets,
                v_grp.code_content,
                v_grp.reference_material
            ) RETURNING id INTO v_new_grp_version_id;

            INSERT INTO pg_temp._id_map_groups (template_id, version_id) VALUES (v_grp.id, v_new_grp_version_id);
        END LOOP;
    END LOOP;

    -- 8. Clone questions (both direct section questions and group questions)
    FOR v_q IN 
        SELECT q.*, s.paper_set_id AS s_paper_id, gs.paper_set_id AS gs_paper_id
        FROM public.question_templates q
        LEFT JOIN public.section_templates s ON q.section_id = s.id
        LEFT JOIN public.group_templates g ON q.group_id = g.id
        LEFT JOIN public.section_templates gs ON g.section_id = gs.id
        WHERE s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id
    LOOP
        INSERT INTO public.question_versions (
            cloned_from_id,
            section_version_id,
            group_version_id,
            type,
            text,
            marks,
            image_assets,
            code_content
        ) VALUES (
            v_q.id,
            (SELECT version_id FROM pg_temp._id_map_sections WHERE template_id = v_q.section_id),
            (SELECT version_id FROM pg_temp._id_map_groups WHERE template_id = v_q.group_id),
            v_q.type,
            v_q.text,
            v_q.marks,
            v_q.image_assets,
            v_q.code_content
        ) RETURNING id INTO v_new_q_version_id;

        INSERT INTO pg_temp._id_map_questions (template_id, version_id) VALUES (v_q.id, v_new_q_version_id);
    END LOOP;

    -- 9. Clone section_content_nodes
    FOR v_node IN
        SELECT scn.*
        FROM public.section_content_nodes scn
        JOIN public.section_templates st ON scn.section_id = st.id
        WHERE st.paper_set_id = p_paper_set_id
        ORDER BY scn.section_id, scn.sequence ASC
    LOOP
        INSERT INTO public.section_content_node_versions (
            section_version_id,
            node_type,
            question_version_id,
            group_version_id,
            sequence
        ) VALUES (
            (SELECT version_id FROM pg_temp._id_map_sections WHERE template_id = v_node.section_id),
            v_node.node_type,
            (SELECT version_id FROM pg_temp._id_map_questions WHERE template_id = v_node.question_id),
            (SELECT version_id FROM pg_temp._id_map_groups WHERE template_id = v_node.group_id),
            v_node.sequence
        );
    END LOOP;

    -- 10. Clone options (including image_assets)
    FOR v_opt IN
        SELECT opt.*
        FROM public.option_templates opt
        JOIN pg_temp._id_map_questions mq ON opt.question_id = mq.template_id
        ORDER BY opt.question_id, opt.sequence ASC
    LOOP
        INSERT INTO public.option_versions (
            cloned_from_id,
            question_version_id,
            text,
            sequence,
            image_assets
        ) VALUES (
            v_opt.id,
            (SELECT version_id FROM pg_temp._id_map_questions WHERE template_id = v_opt.question_id),
            v_opt.text,
            v_opt.sequence,
            v_opt.image_assets
        ) RETURNING id INTO v_new_opt_version_id;

        INSERT INTO pg_temp._id_map_options (template_id, version_id) VALUES (v_opt.id, v_new_opt_version_id);
    END LOOP;

    -- 11. Clone eval_mcq_msq_templates
    FOR v_mcq IN
        SELECT e.*
        FROM public.eval_mcq_msq_templates e
        JOIN pg_temp._id_map_questions mq ON e.question_id = mq.template_id
    LOOP
        INSERT INTO public.eval_mcq_msq_versions (
            question_version_id,
            correct_option_version_id
        ) VALUES (
            (SELECT version_id FROM pg_temp._id_map_questions WHERE template_id = v_mcq.question_id),
            (SELECT version_id FROM pg_temp._id_map_options WHERE template_id = v_mcq.correct_option_id)
        );
    END LOOP;

    -- 12. Clone eval_numeric_templates
    FOR v_num IN
        SELECT en.*
        FROM public.eval_numeric_templates en
        JOIN pg_temp._id_map_questions mq ON en.question_id = mq.template_id
    LOOP
        INSERT INTO public.eval_numeric_versions (
            question_version_id,
            mode,
            exact_val,
            min_val,
            max_val
        ) VALUES (
            (SELECT version_id FROM pg_temp._id_map_questions WHERE template_id = v_num.question_id),
            v_num.mode,
            v_num.exact_val,
            v_num.min_val,
            v_num.max_val
        );
    END LOOP;

    -- 13. Clean up temporary tables
    DROP TABLE IF EXISTS pg_temp._id_map_options;
    DROP TABLE IF EXISTS pg_temp._id_map_questions;
    DROP TABLE IF EXISTS pg_temp._id_map_groups;
    DROP TABLE IF EXISTS pg_temp._id_map_sections;

    -- 14. Mark template status as Ready
    UPDATE public.paper_set_templates
    SET status = 'Ready', updated_at = NOW()
    WHERE id = p_paper_set_id;

    RETURN v_new_paper_version_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_paper_set_template(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_paper_set_template(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Harden validate_paper_for_publishing (Fail-Closed Auth & Least-Privilege Grants)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_paper_for_publishing(p_paper_set_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_invalid UUID;
    v_sec_count INT;
    v_q_count INT;
BEGIN
    -- 1. Identity & Role Verification (fail-closed)
    IF (auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Unauthorized: Authentication required';
        END IF;

        IF public.get_auth_user_role()::text IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Unauthorized: Only admins can validate paper templates for publishing';
        END IF;
    END IF;

    -- 2. Check at least 1 section exists
    SELECT COUNT(*) INTO v_sec_count
    FROM public.section_templates
    WHERE paper_set_id = p_paper_set_id;

    IF v_sec_count = 0 THEN
        RAISE EXCEPTION 'Validation Failed: Paper has no sections';
    END IF;

    -- 3. Check at least 1 question exists in the paper
    SELECT COUNT(*) INTO v_q_count
    FROM public.question_templates q
    LEFT JOIN public.section_templates s ON q.section_id = s.id
    LEFT JOIN public.group_templates g ON q.group_id = g.id
    LEFT JOIN public.section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id);

    IF v_q_count = 0 THEN
        RAISE EXCEPTION 'Validation Failed: Paper contains no questions';
    END IF;

    -- 4. Check MCQ questions: must have >= 2 options and exactly 1 correct option
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

    -- 5. Check MSQ questions: must have >= 2 options and >= 1 correct option
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

    -- 6. Check NUMERICAL questions: must have exactly 1 evaluation config
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

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_paper_for_publishing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_paper_for_publishing(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Restrict check_exam_asset_access to service_role Only
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.check_exam_asset_access(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_exam_asset_access(uuid, text, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. Re-secure routines regranted by migration 21
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.delete_results_demo_paper_versions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_results_demo_paper_versions() TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_student_attempt_restrictions() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_finalize_attempt(UUID) TO service_role;
