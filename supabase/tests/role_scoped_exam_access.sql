-- Rollback-only integration checks, including pre-existing TEST sessions and role changes.
DO $$
DECLARE
  student_id uuid := gen_random_uuid();
  tester_id uuid := gen_random_uuid();
  subject_id uuid;
  type_id uuid;
  paper_id uuid;
  exam_id uuid;
  test_id uuid;
  exam_subject uuid;
  test_subject uuid;
  student_exam_attempt uuid;
  student_test_attempt uuid;
  tester_exam_attempt uuid;
  tester_test_attempt uuid;
  n integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    VALUES (student_id, student_id || '@sst.scaler.com', '{"provider":"email"}', '{}'),
           (tester_id, tester_id || '@sst.scaler.com', '{"provider":"email"}', '{}');
  INSERT INTO public.subjects(code, name) VALUES ('ROLE_' || gen_random_uuid(), 'Role access regression') RETURNING id INTO subject_id;
  INSERT INTO public.assessment_types(name) VALUES ('Role access ' || gen_random_uuid()) RETURNING id INTO type_id;
  INSERT INTO public.paper_set_versions(subject_id, assessment_type_id, title) VALUES (subject_id, type_id, 'Role access paper') RETURNING id INTO paper_id;
  INSERT INTO public.assessment_events(assessment_type_id, title, status) VALUES (type_id, 'Role exam', 'Live') RETURNING id INTO exam_id;
  INSERT INTO public.assessment_events(assessment_type_id, title, status, assignment_type, test_access_mode, test_attempt_policy, test_duration_mins)
    VALUES (type_id, 'Role test', 'Live', 'TEST', 'ALL_ENROLLED', 'UNLIMITED', 30) RETURNING id INTO test_id;
  INSERT INTO public.assessment_subjects(assessment_event_id, subject_id, paper_set_version_id) VALUES (exam_id, subject_id, paper_id) RETURNING id INTO exam_subject;
  INSERT INTO public.assessment_subjects(assessment_event_id, subject_id, paper_set_version_id) VALUES (test_id, subject_id, paper_id) RETURNING id INTO test_subject;
  INSERT INTO public.student_enrollments(student_id, subject_id, is_active) VALUES (student_id, subject_id, true), (tester_id, subject_id, true);
  UPDATE public.users SET role = 'tester' WHERE id = tester_id;
  INSERT INTO public.attempts(student_id, assessment_subject_id, paper_set_version_id, status)
    VALUES (student_id, exam_subject, paper_id, 'Completed') RETURNING id INTO student_exam_attempt;
  INSERT INTO public.attempts(student_id, assessment_subject_id, paper_set_version_id, status, is_test)
    VALUES (student_id, test_subject, paper_id, 'Completed', true) RETURNING id INTO student_test_attempt;
  INSERT INTO public.attempts(student_id, assessment_subject_id, paper_set_version_id, status)
    VALUES (tester_id, exam_subject, paper_id, 'Completed') RETURNING id INTO tester_exam_attempt;
  INSERT INTO public.attempts(student_id, assessment_subject_id, paper_set_version_id, status, is_test)
    VALUES (tester_id, test_subject, paper_id, 'Completed', true) RETURNING id INTO tester_test_attempt;
  INSERT INTO public.student_practice_sessions(student_id, source_attempt_id) VALUES
    (student_id, student_exam_attempt), (student_id, student_test_attempt),
    (tester_id, tester_exam_attempt), (tester_id, tester_test_attempt);

  PERFORM set_config('request.jwt.claim.sub', student_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.assessment_events WHERE id IN (exam_id, test_id);
  IF n <> 1 THEN RAISE EXCEPTION 'Student can see a test event or cannot see exam'; END IF;
  SELECT count(*) INTO n FROM public.assessment_subjects WHERE id = test_subject;
  IF n <> 0 THEN RAISE EXCEPTION 'Student can see test subjects'; END IF;
  SELECT count(*) INTO n FROM public.attempts WHERE id IN (student_exam_attempt, student_test_attempt);
  IF n <> 1 THEN RAISE EXCEPTION 'Student can see old test attempts or lost exam access'; END IF;
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE source_attempt_id IN (student_exam_attempt, student_test_attempt);
  IF n <> 1 THEN RAISE EXCEPTION 'Student can see old test practice'; END IF;
  BEGIN
    PERFORM public.start_student_attempts(test_id, ARRAY[test_subject]);
    RAISE EXCEPTION 'Student can invoke test start RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', tester_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.assessment_events WHERE id IN (exam_id, test_id);
  IF n <> 2 THEN RAISE EXCEPTION 'Tester cannot see both event types'; END IF;
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE source_attempt_id IN (tester_exam_attempt, tester_test_attempt);
  IF n <> 2 THEN RAISE EXCEPTION 'Tester cannot see both own practice sources'; END IF;
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE source_attempt_id IN (student_exam_attempt, student_test_attempt);
  IF n <> 0 THEN RAISE EXCEPTION 'Tester can see another person''s practice'; END IF;
  -- Test assignment retakes remain available to testers.
  PERFORM public.start_student_attempts(test_id, ARRAY[test_subject]);
  EXECUTE 'RESET ROLE';

  -- Subject reviews must follow papers taken, rather than current enrollment.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.student_enrollments e WHERE e.student_id = tester_id;
  PERFORM set_config('request.jwt.claim.sub', tester_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.assessment_subjects WHERE id IN (exam_subject, test_subject);
  IF n <> 2 THEN RAISE EXCEPTION 'Tester lost own paper subjects after enrollment changed'; END IF;
  EXECUTE 'RESET ROLE';

  -- Do not depend on a possibly stale JWT role when a tester becomes a student.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.users SET role = 'student' WHERE id = tester_id;
  PERFORM set_config('request.jwt.claim.sub', tester_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', tester_id, 'user_role', 'tester')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.student_practice_sessions WHERE source_attempt_id IN (tester_exam_attempt, tester_test_attempt);
  IF n <> 1 THEN RAISE EXCEPTION 'Role change did not hide existing test practice immediately'; END IF;
  SELECT count(*) INTO n FROM public.assessment_subjects WHERE id IN (exam_subject, test_subject);
  IF n <> 1 THEN RAISE EXCEPTION 'Role change leaked TEST subjects or hid a taken exam subject'; END IF;
  BEGIN
    PERFORM public.start_student_attempts(test_id, ARRAY[test_subject]);
    RAISE EXCEPTION 'Demoted tester resumed a test through stale claims';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE SQLSTATE 'ZX001' USING MESSAGE = 'Role checks passed';
EXCEPTION WHEN SQLSTATE 'ZX001' THEN
  RAISE NOTICE 'Student/tester event visibility, owned practice, RPC restrictions and role changes passed; fixtures rolled back';
END $$;
