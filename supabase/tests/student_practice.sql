-- Transaction-only verification: no users, papers or practice records survive.
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  subject_id uuid;
  type_id uuid;
  paper_id uuid;
  event_id uuid;
  asub_id uuid;
  attempt_id uuid;
  practice_id uuid;
  rows_changed integer;
  n integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (owner_id, owner_id || '@sst.scaler.com', '{"provider":"email"}', '{}'),
           (other_id, other_id || '@sst.scaler.com', '{"provider":"email"}', '{}');
  INSERT INTO public.subjects(code, name) VALUES ('PRACTICE_' || gen_random_uuid(), 'Rollback-only practice subject') RETURNING id INTO subject_id;
  INSERT INTO public.assessment_types(name) VALUES ('Rollback-only practice ' || gen_random_uuid()) RETURNING id INTO type_id;
  INSERT INTO public.paper_set_versions(subject_id, assessment_type_id, title) VALUES (subject_id, type_id, 'Practice regression') RETURNING id INTO paper_id;
  INSERT INTO public.assessment_events(assessment_type_id, title, status) VALUES (type_id, 'Practice regression', 'Completed') RETURNING id INTO event_id;
  INSERT INTO public.assessment_subjects(assessment_event_id, subject_id, paper_set_version_id) VALUES (event_id, subject_id, paper_id) RETURNING id INTO asub_id;
  INSERT INTO public.attempts(student_id, assessment_subject_id, paper_set_version_id, status) VALUES (owner_id, asub_id, paper_id, 'Completed') RETURNING id INTO attempt_id;
  INSERT INTO public.student_practice_sessions(student_id, source_attempt_id) VALUES (owner_id, attempt_id) RETURNING id INTO practice_id;
  BEGIN
    INSERT INTO public.student_practice_sessions(student_id, source_attempt_id) VALUES (owner_id, attempt_id);
    RAISE EXCEPTION 'Duplicate active session was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Revision compare-and-swap prevents stale tabs from changing saved work.
  UPDATE public.student_practice_sessions SET responses = '{"q": "a"}', revision = 1 WHERE id = practice_id AND revision = 0;
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 1 THEN RAISE EXCEPTION 'Initial revision save failed'; END IF;
  UPDATE public.student_practice_sessions SET responses = '{}' WHERE id = practice_id AND revision = 0;
  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  IF rows_changed <> 0 THEN RAISE EXCEPTION 'Stale revision overwrote progress'; END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE id = practice_id;
  IF n <> 1 THEN RAISE EXCEPTION 'Owner cannot read practice'; END IF;
  BEGIN
    UPDATE public.student_practice_sessions SET score = 999 WHERE id = practice_id;
    RAISE EXCEPTION 'Authenticated client was allowed to forge a score';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', other_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE id = practice_id;
  IF n <> 0 THEN RAISE EXCEPTION 'Another student can read private practice'; END IF;
  EXECUTE 'RESET ROLE';
  IF has_table_privilege('anon', 'public.student_practice_sessions', 'SELECT') THEN RAISE EXCEPTION 'Anonymous read is allowed'; END IF;

  UPDATE public.student_practice_sessions SET status = 'Completed', completed_at = now(), score = 0, max_marks = 2 WHERE id = practice_id;
  INSERT INTO public.student_practice_sessions(student_id, source_attempt_id) VALUES (owner_id, attempt_id);
  IF (SELECT count(*) FROM public.attempts WHERE student_id = owner_id) <> 1 THEN RAISE EXCEPTION 'Practice changed official attempts'; END IF;
  -- Roll back the entire block, then catch only this deliberate success signal.
  RAISE SQLSTATE 'ZX001' USING MESSAGE = 'Practice checks passed';
EXCEPTION WHEN SQLSTATE 'ZX001' THEN
  RAISE NOTICE 'Practice isolation, repeat sessions, revision checks, ownership and write restrictions passed; all fixtures rolled back';
END $$;
