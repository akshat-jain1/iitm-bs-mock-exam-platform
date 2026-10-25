-- ==============================================================================
-- 20261006000014_results_demo_cleanup_rpc.sql
-- Dedicated helper RPC for safely deleting Results Demo paper versions
-- ==============================================================================

CREATE OR REPLACE FUNCTION delete_results_demo_paper_versions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    ALTER TABLE paper_set_versions DISABLE TRIGGER enforce_paper_version_immutability;
    ALTER TABLE section_versions DISABLE TRIGGER enforce_section_version_immutability;
    ALTER TABLE question_versions DISABLE TRIGGER enforce_question_version_immutability;
    
    DELETE FROM question_versions WHERE section_version_id IN (
        SELECT id FROM section_versions WHERE paper_set_version_id IN (
            SELECT id FROM paper_set_versions WHERE title LIKE 'Results Demo End Term — %'
        )
    );
    DELETE FROM section_versions WHERE paper_set_version_id IN (
        SELECT id FROM paper_set_versions WHERE title LIKE 'Results Demo End Term — %'
    );
    DELETE FROM paper_set_versions WHERE title LIKE 'Results Demo End Term — %';

    ALTER TABLE paper_set_versions ENABLE TRIGGER enforce_paper_version_immutability;
    ALTER TABLE section_versions ENABLE TRIGGER enforce_section_version_immutability;
    ALTER TABLE question_versions ENABLE TRIGGER enforce_question_version_immutability;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_results_demo_paper_versions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_results_demo_paper_versions() TO service_role;
