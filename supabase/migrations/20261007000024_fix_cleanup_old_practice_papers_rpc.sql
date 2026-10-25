-- ==============================================================================
-- 20261007000024_fix_cleanup_old_practice_papers_rpc.sql
-- Fix cleanup_old_practice_papers RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_practice_papers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_template_ids UUID[];
    v_target_version_ids UUID[];
    v_target_event_ids UUID[];
    v_res JSONB;
BEGIN
    -- 1. Identify target events: May 24 Quiz 1 & July 16 Quiz 1
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_target_event_ids
    FROM assessment_events
    WHERE id IN (
        '75ebb166-9d22-4e32-bec8-151edb5df75a'::uuid,
        'b6c2fca2-eefe-4423-b5e3-3a393b5d8120'::uuid,
        '97829523-80c4-4903-8e17-891400f6cb13'::uuid,
        '646a5e04-86cf-483d-b5d4-2c6da9540631'::uuid
    ) OR title ILIKE '%May 24%' OR title ILIKE '%July 16%' OR title ILIKE '%16 Jul 26%';

    -- 2. Identify target templates
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_target_template_ids
    FROM paper_set_templates
    WHERE title ILIKE '%May 24%' OR title ILIKE '%July 16%' OR title ILIKE '%16 Jul 26%';

    -- 3. Identify target versions
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_target_version_ids
    FROM paper_set_versions
    WHERE cloned_from_id = ANY(v_target_template_ids) 
       OR title ILIKE '%May 24%' 
       OR title ILIKE '%July 16%' 
       OR title ILIKE '%16 Jul 26%';

    -- 4. Delete dependent events data (attempts, integrity, responses, assessment_subjects, events)
    IF array_length(v_target_event_ids, 1) > 0 THEN
        DELETE FROM exam_integrity_events WHERE attempt_id IN (
            SELECT id FROM attempts WHERE assessment_subject_id IN (
                SELECT id FROM assessment_subjects WHERE assessment_event_id = ANY(v_target_event_ids)
            )
        );
        DELETE FROM responses WHERE attempt_id IN (
            SELECT id FROM attempts WHERE assessment_subject_id IN (
                SELECT id FROM assessment_subjects WHERE assessment_event_id = ANY(v_target_event_ids)
            )
        );
        DELETE FROM attempts WHERE assessment_subject_id IN (
            SELECT id FROM assessment_subjects WHERE assessment_event_id = ANY(v_target_event_ids)
        );
        DELETE FROM assessment_subjects WHERE assessment_event_id = ANY(v_target_event_ids);
        DELETE FROM assessment_events WHERE id = ANY(v_target_event_ids);
    END IF;

    -- Also check any attempts referencing target versions directly
    IF array_length(v_target_version_ids, 1) > 0 THEN
        DELETE FROM exam_integrity_events WHERE attempt_id IN (
            SELECT id FROM attempts WHERE paper_set_version_id = ANY(v_target_version_ids)
        );
        DELETE FROM responses WHERE attempt_id IN (
            SELECT id FROM attempts WHERE paper_set_version_id = ANY(v_target_version_ids)
        );
        DELETE FROM attempts WHERE paper_set_version_id = ANY(v_target_version_ids);
        DELETE FROM assessment_subjects WHERE paper_set_version_id = ANY(v_target_version_ids);
    END IF;

    -- 5. Delete versions tree by disabling immutability triggers
    ALTER TABLE paper_set_versions DISABLE TRIGGER ALL;
    ALTER TABLE section_versions DISABLE TRIGGER ALL;
    ALTER TABLE group_versions DISABLE TRIGGER ALL;
    ALTER TABLE question_versions DISABLE TRIGGER ALL;
    ALTER TABLE option_versions DISABLE TRIGGER ALL;
    ALTER TABLE eval_mcq_msq_versions DISABLE TRIGGER ALL;
    ALTER TABLE eval_numeric_versions DISABLE TRIGGER ALL;
    ALTER TABLE section_content_node_versions DISABLE TRIGGER ALL;

    IF array_length(v_target_version_ids, 1) > 0 THEN
        DELETE FROM eval_mcq_msq_versions WHERE question_version_id IN (
            SELECT id FROM question_versions WHERE section_version_id IN (
                SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
            )
        );
        DELETE FROM eval_numeric_versions WHERE question_version_id IN (
            SELECT id FROM question_versions WHERE section_version_id IN (
                SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
            )
        );
        DELETE FROM option_versions WHERE question_version_id IN (
            SELECT id FROM question_versions WHERE section_version_id IN (
                SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
            )
        );
        DELETE FROM question_versions WHERE section_version_id IN (
            SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
        );
        DELETE FROM group_versions WHERE section_version_id IN (
            SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
        );
        DELETE FROM section_content_node_versions WHERE section_version_id IN (
            SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids)
        );
        DELETE FROM section_versions WHERE paper_set_version_id = ANY(v_target_version_ids);
        DELETE FROM paper_set_versions WHERE id = ANY(v_target_version_ids);
    END IF;

    ALTER TABLE paper_set_versions ENABLE TRIGGER ALL;
    ALTER TABLE section_versions ENABLE TRIGGER ALL;
    ALTER TABLE group_versions ENABLE TRIGGER ALL;
    ALTER TABLE question_versions ENABLE TRIGGER ALL;
    ALTER TABLE option_versions ENABLE TRIGGER ALL;
    ALTER TABLE eval_mcq_msq_versions ENABLE TRIGGER ALL;
    ALTER TABLE eval_numeric_versions ENABLE TRIGGER ALL;
    ALTER TABLE section_content_node_versions ENABLE TRIGGER ALL;

    -- 6. Delete templates tree
    IF array_length(v_target_template_ids, 1) > 0 THEN
        DELETE FROM option_templates WHERE question_id IN (
            SELECT id FROM question_templates WHERE section_id IN (
                SELECT id FROM section_templates WHERE paper_set_id = ANY(v_target_template_ids)
            )
        );
        DELETE FROM question_templates WHERE section_id IN (
            SELECT id FROM section_templates WHERE paper_set_id = ANY(v_target_template_ids)
        );
        DELETE FROM group_templates WHERE section_id IN (
            SELECT id FROM section_templates WHERE paper_set_id = ANY(v_target_template_ids)
        );
        DELETE FROM section_templates WHERE paper_set_id = ANY(v_target_template_ids);
        DELETE FROM paper_set_templates WHERE id = ANY(v_target_template_ids);
    END IF;

    v_res := jsonb_build_object(
        'deleted_events', COALESCE(array_length(v_target_event_ids, 1), 0),
        'deleted_templates', COALESCE(array_length(v_target_template_ids, 1), 0),
        'deleted_versions', COALESCE(array_length(v_target_version_ids, 1), 0)
    );
    RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_practice_papers() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_practice_papers() TO service_role;
