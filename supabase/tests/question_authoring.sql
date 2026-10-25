-- Run locally with psql -v ON_ERROR_STOP=1, or remotely with `supabase db query --linked -f ...`.
-- Every fixture and publication is rolled back, including on assertion failure.
BEGIN;
DO $$
DECLARE
    v_admin uuid := gen_random_uuid();
    v_subject uuid;
    v_assessment uuid;
    v_paper uuid;
    v_section uuid;
    v_group uuid;
    v_question uuid;
    v_text_question uuid;
    v_option_a uuid;
    v_option_b uuid;
    v_version uuid;
    v_second_version uuid;
    v_payload jsonb;
    v_assets jsonb := '[{"storage_path":"authored/regression/diagram.png","display_width":320,"width":800,"height":400}]';
    v_invalid jsonb;
    v_rejected boolean;
BEGIN
    INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_admin, v_admin || '@sst.scaler.com', '{"provider":"email"}', '{"full_name":"Rollback-only regression admin"}');
    UPDATE public.users SET role = 'admin' WHERE id = v_admin;
    INSERT INTO public.subjects(code, name) VALUES ('REG_' || gen_random_uuid(), 'Rollback-only regression subject') RETURNING id INTO v_subject;
    INSERT INTO public.assessment_types(name) VALUES ('Rollback-only regression ' || gen_random_uuid()) RETURNING id INTO v_assessment;
    INSERT INTO public.paper_set_templates(subject_id, assessment_type_id, title)
    VALUES (v_subject, v_assessment, 'Rollback-only question authoring regression') RETURNING id INTO v_paper;
    INSERT INTO public.section_templates(paper_set_id, title) VALUES (v_paper, 'Test section') RETURNING id INTO v_section;
    INSERT INTO public.group_templates(section_id, title) VALUES (v_section, 'Test group') RETURNING id INTO v_group;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'user_role', 'admin')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

    -- Text-only creation exercises the previously broken content and answer triggers.
    v_payload := jsonb_build_object('paper_set_id', v_paper, 'section_id', v_section, 'type', 'MCQ', 'text', 'Text prompt', 'marks', 1,
      'options', jsonb_build_array(jsonb_build_object('text', 'A', 'is_correct', true), jsonb_build_object('text', 'B', 'is_correct', false)));
    v_text_question := (public.save_question_template(v_payload)->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.section_content_nodes WHERE question_id = v_text_question) THEN
      RAISE EXCEPTION 'Text question missing content node';
    END IF;

    -- Image-only question and option; text+image option also survives saving.
    v_payload := v_payload || jsonb_build_object('text', '', 'image_assets', v_assets,
      'options', jsonb_build_array(jsonb_build_object('text', '', 'image_assets', v_assets, 'is_correct', true),
                                  jsonb_build_object('text', 'With image', 'image_assets', v_assets, 'is_correct', false)));
    v_question := (public.save_question_template(v_payload)->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.question_templates WHERE id = v_question AND text = '' AND image_assets = v_assets) THEN
      RAISE EXCEPTION 'Image-only question did not persist';
    END IF;
    SELECT id INTO v_option_a FROM public.option_templates WHERE question_id = v_question AND sequence = 1;
    SELECT id INTO v_option_b FROM public.option_templates WHERE question_id = v_question AND sequence = 2;

    -- Editing/reordering keeps option identity and reconciles the answer atomically.
    v_payload := v_payload || jsonb_build_object('id', v_question, 'options', jsonb_build_array(
      jsonb_build_object('id', v_option_b, 'text', 'With image', 'image_assets', v_assets, 'is_correct', true),
      jsonb_build_object('id', v_option_a, 'text', '', 'image_assets', v_assets, 'is_correct', false)));
    PERFORM public.save_question_template(v_payload);
    IF NOT EXISTS (SELECT 1 FROM public.option_templates WHERE id = v_option_b AND sequence = 1)
       OR NOT EXISTS (SELECT 1 FROM public.eval_mcq_msq_templates WHERE question_id = v_question AND correct_option_id = v_option_b) THEN
      RAISE EXCEPTION 'Option reorder/answer reconciliation failed';
    END IF;

    -- Group MSQ and image-only numerical exercise all template evaluation triggers.
    PERFORM public.save_question_template(jsonb_build_object('paper_set_id', v_paper, 'group_id', v_group, 'type', 'MSQ', 'text', '', 'image_assets', v_assets, 'marks', 2,
      'options', jsonb_build_array(jsonb_build_object('text', 'A', 'is_correct', true), jsonb_build_object('text', '', 'image_assets', v_assets, 'is_correct', true))));
    PERFORM public.save_question_template(jsonb_build_object('paper_set_id', v_paper, 'section_id', v_section, 'type', 'NUMERICAL', 'text', '', 'image_assets', v_assets, 'marks', 1,
      'eval_numeric', jsonb_build_object('mode', 'RANGE', 'min_val', 1, 'max_val', 2)));

    -- Empty prompts/options cannot be used to bypass content validation.
    FOREACH v_invalid IN ARRAY ARRAY['null'::jsonb, '[]'::jsonb, '{}'::jsonb] LOOP
      v_rejected := false;
      BEGIN
        PERFORM public.save_question_template(v_payload || jsonb_build_object('id', null, 'text', '', 'image_assets', v_invalid));
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%text or an image%' THEN RAISE; END IF;
        v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Empty prompt accepted'; END IF;
    END LOOP;
    v_rejected := false;
    BEGIN
      PERFORM public.save_question_template(v_payload || jsonb_build_object('id', null, 'options', '[{"text":"","is_correct":true},{"text":"B","is_correct":false}]'::jsonb));
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%text or an image%' THEN RAISE; END IF;
      v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Empty option accepted'; END IF;

    -- Publishing exercises all version triggers under a restricted search path.
    v_version := public.publish_paper_set_template(v_paper);
    IF NOT EXISTS (SELECT 1 FROM public.question_versions WHERE cloned_from_id = v_question AND image_assets = v_assets AND text = '')
       OR NOT EXISTS (SELECT 1 FROM public.option_versions WHERE cloned_from_id = v_option_a AND image_assets = v_assets AND text = '') THEN
      RAISE EXCEPTION 'Publication lost image-only content or sizing';
    END IF;
    PERFORM public.save_question_template(v_payload || jsonb_build_object('image_assets', '[{"storage_path":"authored/regression/diagram.png","display_width":480}]'::jsonb));
    v_second_version := public.publish_paper_set_template(v_paper);
    IF v_version = v_second_version OR NOT EXISTS (
      SELECT 1 FROM public.question_versions q JOIN public.section_versions s ON s.id = q.section_version_id
      WHERE s.paper_set_version_id = v_version AND q.cloned_from_id = v_question AND q.image_assets = v_assets
    ) THEN RAISE EXCEPTION 'Republishing changed the original snapshot'; END IF;

    -- Admin-only execution still fails closed after replacing the RPC.
    IF has_function_privilege('anon', 'public.save_question_template(jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous execution granted';
    END IF;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","user_role":"student"}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    v_rejected := false;
    BEGIN
      PERFORM public.save_question_template(v_payload);
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'Unauthorized:%' THEN RAISE; END IF;
      v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Unauthorized save accepted'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: text/image creation, options, reordering, grouped MSQ, numerical, validation, publication, immutable sizing, and permissions; all fixtures rolled back' AS result;
