-- Migration: 20261007000022_performance_indexes.sql
-- Description: Composite and GIN indexes for query paths, plus fast asset authorization RPC.

-- 1. Student Enrollments active check
CREATE INDEX IF NOT EXISTS idx_student_enrollments_active 
ON public.student_enrollments (student_id, is_active);

-- 2. Attempts lookup during exam start, autosave validation, and live session verification
CREATE INDEX IF NOT EXISTS idx_attempts_student_asubj_status 
ON public.attempts (student_id, assessment_subject_id, status);

-- 3. GIN indexes for JSONB image_assets to eliminate sequential table scans during asset resolution
CREATE INDEX IF NOT EXISTS idx_question_versions_image_assets 
ON public.question_versions USING gin (image_assets jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_group_versions_image_assets 
ON public.group_versions USING gin (image_assets jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_option_versions_image_assets 
ON public.option_versions USING gin (image_assets jsonb_path_ops);

-- 4. Fast helper RPC for checking asset access in 1 shot inside PostgreSQL
CREATE OR REPLACE FUNCTION public.check_exam_asset_access(
  p_user_id uuid,
  p_user_role text,
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_authorized boolean := false;
BEGIN
  -- Admin has unrestricted access to preview exam assets for authoring
  IF p_user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- For student: verify if storage_path belongs to any paper version in active/live events or student's attempts
  SELECT EXISTS (
    WITH student_versions AS (
      -- Versions in student attempts
      SELECT paper_set_version_id 
      FROM attempts 
      WHERE student_id = p_user_id
      UNION
      -- Versions in live assessment events
      SELECT asub.paper_set_version_id
      FROM assessment_subjects asub
      JOIN assessment_events ae ON ae.id = asub.assessment_event_id
      WHERE ae.status = 'Live'
      UNION
      -- Versions in events where student has attempts
      SELECT asub2.paper_set_version_id
      FROM assessment_subjects asub2
      WHERE asub2.assessment_event_id IN (
        SELECT asub_att.assessment_event_id
        FROM attempts att
        JOIN assessment_subjects asub_att ON asub_att.id = att.assessment_subject_id
        WHERE att.student_id = p_user_id
      )
    ),
    authorized_sections AS (
      SELECT id 
      FROM section_versions 
      WHERE paper_set_version_id IN (SELECT paper_set_version_id FROM student_versions)
    )
    SELECT 1
    WHERE EXISTS (
      -- Check question versions
      SELECT 1 FROM question_versions qv
      WHERE qv.section_version_id IN (SELECT id FROM authorized_sections)
        AND qv.image_assets @> jsonb_build_array(jsonb_build_object('storage_path', p_storage_path))
    )
    OR EXISTS (
      -- Check group versions
      SELECT 1 FROM group_versions gv
      WHERE gv.section_version_id IN (SELECT id FROM authorized_sections)
        AND (
          gv.image_assets @> jsonb_build_array(jsonb_build_object('storage_path', p_storage_path))
          OR gv.image_assets @> jsonb_build_object('storage_path', p_storage_path)
        )
    )
    OR EXISTS (
      -- Check option versions
      SELECT 1 FROM option_versions ov
      JOIN question_versions qv ON qv.id = ov.question_version_id
      WHERE qv.section_version_id IN (SELECT id FROM authorized_sections)
        AND ov.image_assets @> jsonb_build_array(jsonb_build_object('storage_path', p_storage_path))
    )
    OR EXISTS (
      -- Check section reference material
      SELECT 1 FROM section_versions sv
      WHERE sv.id IN (SELECT id FROM authorized_sections)
        AND sv.reference_material::text LIKE '%' || p_storage_path || '%'
    )
  ) INTO v_authorized;

  RETURN v_authorized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_exam_asset_access(uuid, text, text) TO authenticated, service_role;
