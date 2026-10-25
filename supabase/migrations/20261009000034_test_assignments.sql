-- Migration: 20261009000034_test_assignments.sql
-- Description: Complete V7 Test Assignments feature: enums, schema extensions, check constraints, partial unique indexes, security triggers, and RPC

-- 1. Safely Add 'tester' to user_role Enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tester';

-- 2. Create Enums for Test Assignments
DO $$ BEGIN
    CREATE TYPE public.assessment_assignment_type AS ENUM ('PRODUCTION', 'TEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.test_access_mode AS ENUM ('TESTER_ONLY', 'ALL_ENROLLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.test_attempt_policy AS ENUM ('UNLIMITED', 'LIMITED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Extend assessment_events Schema
ALTER TABLE public.assessment_events
    ADD COLUMN IF NOT EXISTS assignment_type public.assessment_assignment_type,
    ADD COLUMN IF NOT EXISTS test_access_mode public.test_access_mode,
    ADD COLUMN IF NOT EXISTS test_attempt_policy public.test_attempt_policy,
    ADD COLUMN IF NOT EXISTS test_max_attempts INTEGER,
    ADD COLUMN IF NOT EXISTS test_duration_mins INTEGER;

-- Backfill existing events to PRODUCTION
UPDATE public.assessment_events 
SET assignment_type = 'PRODUCTION' 
WHERE assignment_type IS NULL;

-- Enforce NOT NULL and default on assignment_type
ALTER TABLE public.assessment_events 
    ALTER COLUMN assignment_type SET NOT NULL,
    ALTER COLUMN assignment_type SET DEFAULT 'PRODUCTION';

-- 4. Enforce Configuration Constraints on assessment_events
ALTER TABLE public.assessment_events
    DROP CONSTRAINT IF EXISTS chk_assessment_events_assignment_rules;

ALTER TABLE public.assessment_events
    ADD CONSTRAINT chk_assessment_events_assignment_rules
    CHECK (
        (
            assignment_type = 'PRODUCTION' AND
            test_access_mode IS NULL AND
            test_attempt_policy IS NULL AND
            test_max_attempts IS NULL AND
            test_duration_mins IS NULL
        ) OR (
            assignment_type = 'TEST' AND
            test_access_mode IS NOT NULL AND
            test_attempt_policy IS NOT NULL AND
            (test_duration_mins IS NOT NULL AND test_duration_mins > 0) AND
            (
                (test_attempt_policy = 'LIMITED' AND test_max_attempts IS NOT NULL AND test_max_attempts > 0) OR
                (test_attempt_policy = 'UNLIMITED' AND test_max_attempts IS NULL)
            )
        )
    );

-- 5. Extend attempts Table
ALTER TABLE public.attempts
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN,
    ADD COLUMN IF NOT EXISTS attempt_number INTEGER;

-- Backfill existing attempts to PRODUCTION defaults
UPDATE public.attempts 
SET is_test = false 
WHERE is_test IS NULL;

UPDATE public.attempts 
SET attempt_number = 1 
WHERE attempt_number IS NULL;

-- Enforce NOT NULL and defaults
ALTER TABLE public.attempts 
    ALTER COLUMN is_test SET NOT NULL,
    ALTER COLUMN is_test SET DEFAULT false,
    ALTER COLUMN attempt_number SET NOT NULL,
    ALTER COLUMN attempt_number SET DEFAULT 1;

-- 6. Enforce Attempt Constraints
ALTER TABLE public.attempts
    DROP CONSTRAINT IF EXISTS chk_attempts_attempt_number_positive;

ALTER TABLE public.attempts
    ADD CONSTRAINT chk_attempts_attempt_number_positive
    CHECK (attempt_number >= 1);

-- 7. Transition Unique Constraints to Partial Indexes
ALTER TABLE public.attempts
    DROP CONSTRAINT IF EXISTS attempts_student_id_assessment_subject_id_key;

DROP INDEX IF EXISTS idx_attempts_production_unique;
DROP INDEX IF EXISTS idx_attempts_test_unique;

-- Production: Strictly one attempt per student per assessment subject
CREATE UNIQUE INDEX idx_attempts_production_unique
ON public.attempts (student_id, assessment_subject_id)
WHERE (is_test = false);

-- Test: Repeatable attempts unique by attempt_number
CREATE UNIQUE INDEX idx_attempts_test_unique
ON public.attempts (student_id, assessment_subject_id, attempt_number)
WHERE (is_test = true);

CREATE INDEX IF NOT EXISTS idx_attempts_lookup_filtered
ON public.attempts (student_id, assessment_subject_id, status);

-- 8. Trigger: Freeze Assessment Event Configuration After First Attempt (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.freeze_assessment_event_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (OLD.assignment_type IS DISTINCT FROM NEW.assignment_type OR
        OLD.test_access_mode IS DISTINCT FROM NEW.test_access_mode OR
        OLD.test_attempt_policy IS DISTINCT FROM NEW.test_attempt_policy OR
        OLD.test_max_attempts IS DISTINCT FROM NEW.test_max_attempts OR
        OLD.test_duration_mins IS DISTINCT FROM NEW.test_duration_mins) THEN
        
        IF EXISTS (
            SELECT 1 
            FROM public.attempts a
            JOIN public.assessment_subjects asubj ON a.assessment_subject_id = asubj.id
            WHERE asubj.assessment_event_id = OLD.id
            LIMIT 1
        ) THEN
            RAISE EXCEPTION 'Assessment event configuration fields (assignment_type, test_access_mode, test_attempt_policy, test_max_attempts, test_duration_mins) are immutable once an attempt has been created.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_assessment_event_config_freeze ON public.assessment_events;
CREATE TRIGGER enforce_assessment_event_config_freeze
BEFORE UPDATE ON public.assessment_events
FOR EACH ROW
EXECUTE FUNCTION public.freeze_assessment_event_configuration();

-- 9. Trigger: Enforce is_test <-> assignment_type Consistency
CREATE OR REPLACE FUNCTION public.verify_attempt_test_flag_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_assignment_type TEXT;
BEGIN
    SELECT ae.assignment_type::text INTO v_assignment_type
    FROM public.assessment_subjects asubj
    JOIN public.assessment_events ae ON asubj.assessment_event_id = ae.id
    WHERE asubj.id = NEW.assessment_subject_id;

    IF v_assignment_type IS NULL THEN
        RAISE EXCEPTION 'Assessment subject % is not linked to a valid assessment event', NEW.assessment_subject_id;
    END IF;

    IF v_assignment_type = 'PRODUCTION' AND NEW.is_test = true THEN
        RAISE EXCEPTION 'Invalid attempt: Production assessments cannot have is_test = true';
    END IF;

    IF v_assignment_type = 'TEST' AND NEW.is_test = false THEN
        RAISE EXCEPTION 'Invalid attempt: Test assessments cannot have is_test = false';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_attempt_test_flag_consistency ON public.attempts;
CREATE TRIGGER check_attempt_test_flag_consistency
BEFORE INSERT OR UPDATE ON public.attempts
FOR EACH ROW
EXECUTE FUNCTION public.verify_attempt_test_flag_consistency();

-- 10. Trigger: Prevent Admin Production Attempts (Checks Caller Role & Target Student Role)
CREATE OR REPLACE FUNCTION public.prevent_admin_production_attempts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_role TEXT;
    v_caller_role TEXT;
    v_assignment_type TEXT;
BEGIN
    SELECT ae.assignment_type::text INTO v_assignment_type
    FROM public.assessment_subjects asubj
    JOIN public.assessment_events ae ON asubj.assessment_event_id = ae.id
    WHERE asubj.id = NEW.assessment_subject_id;

    IF v_assignment_type = 'PRODUCTION' THEN
        -- Check authenticated caller role (prevents admin creating for any user)
        v_caller_role := public.get_auth_user_role()::text;
        IF v_caller_role = 'admin' THEN
            RAISE EXCEPTION 'Database policy violation: Admin users cannot participate in or create production attempts';
        END IF;

        -- Check target student role (prevents assigning production attempt to an admin)
        SELECT role::text INTO v_target_role
        FROM public.users
        WHERE id = NEW.student_id;

        IF v_target_role = 'admin' THEN
            RAISE EXCEPTION 'Database policy violation: Cannot assign a production attempt to an admin user';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_no_admin_production_attempts ON public.attempts;
CREATE TRIGGER enforce_no_admin_production_attempts
BEFORE INSERT ON public.attempts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_production_attempts();

-- 11. Trigger: Freeze Attempt Identity and Security Fields
CREATE OR REPLACE FUNCTION public.freeze_attempt_identity()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.student_id IS DISTINCT FROM NEW.student_id OR 
       OLD.assessment_subject_id IS DISTINCT FROM NEW.assessment_subject_id OR 
       OLD.paper_set_version_id IS DISTINCT FROM NEW.paper_set_version_id OR
       OLD.attempt_number IS DISTINCT FROM NEW.attempt_number OR
       OLD.is_test IS DISTINCT FROM NEW.is_test OR
       OLD.start_time IS DISTINCT FROM NEW.start_time THEN
        RAISE EXCEPTION 'Attempt identity and security fields (student_id, assessment_subject_id, paper_set_version_id, attempt_number, is_test, start_time) are permanently immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attempt_identity_freeze ON public.attempts;
CREATE TRIGGER enforce_attempt_identity_freeze 
BEFORE UPDATE ON public.attempts 
FOR EACH ROW 
EXECUTE FUNCTION public.freeze_attempt_identity();

-- 12. Trigger: Enforce Role Restrictions on Attempts (Enum 55P04 Safe)
CREATE OR REPLACE FUNCTION public.enforce_student_attempt_restrictions()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := public.get_auth_user_role()::text;
    IF v_role IN ('student', 'tester') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.start_time = NOW();
            NEW.status = 'Live';
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.start_time != NEW.start_time THEN
                RAISE EXCEPTION 'Cannot modify attempt start_time';
            END IF;
            IF NEW.status = 'Completed' THEN
                RAISE EXCEPTION 'Cannot manually set status to Completed; use finalize_attempts RPC';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_student_attempt_security ON public.attempts;
CREATE TRIGGER check_student_attempt_security
BEFORE INSERT OR UPDATE ON public.attempts
FOR EACH ROW 
EXECUTE FUNCTION public.enforce_student_attempt_restrictions();

-- 13. Install Secure start_student_attempts RPC
CREATE OR REPLACE FUNCTION public.start_student_attempts(
    p_assessment_id UUID,
    p_assessment_subject_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_email_norm TEXT;
    v_assessment RECORD;
    v_as RECORD;
    v_as_id UUID;
    v_distinct_subject_count INTEGER;
    v_requires_enrollment BOOLEAN;
    v_enrolled BOOLEAN;
    v_current_attempt RECORD;
    v_existing_count INTEGER;
    v_next_attempt_number INTEGER;
    v_attempt_ids UUID[] := ARRAY[]::UUID[];
    v_new_attempt_id UUID;
    v_lock_key BIGINT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required';
    END IF;

    SELECT role::text, email INTO v_caller_role, v_caller_email
    FROM public.users
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User record not found';
    END IF;

    IF v_caller_email IS NULL THEN
        SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
    END IF;

    v_email_norm := pg_catalog.lower(pg_catalog.trim(v_caller_email));
    IF v_email_norm IS NULL 
       OR (pg_catalog.length(v_email_norm) - pg_catalog.length(pg_catalog.replace(v_email_norm, '@', ''))) != 1
       OR pg_catalog.split_part(v_email_norm, '@', 1) = ''
       OR pg_catalog.split_part(v_email_norm, '@', 2) != 'sst.scaler.com' THEN
        RAISE EXCEPTION 'Unauthorized: Access restricted to @sst.scaler.com email addresses';
    END IF;

    IF p_assessment_id IS NULL 
       OR p_assessment_subject_ids IS NULL 
       OR pg_catalog.cardinality(p_assessment_subject_ids) = 0 THEN
        RAISE EXCEPTION 'Invalid parameters: assessment and subjects required';
    END IF;

    IF pg_catalog.cardinality(p_assessment_subject_ids) > 4 THEN
        RAISE EXCEPTION 'Cannot select more than 4 subjects for an assessment';
    END IF;

    SELECT pg_catalog.count(DISTINCT elem)::integer INTO v_distinct_subject_count
    FROM pg_catalog.unnest(p_assessment_subject_ids) AS elem;

    IF v_distinct_subject_count != pg_catalog.cardinality(p_assessment_subject_ids) THEN
        RAISE EXCEPTION 'Duplicate subject selection detected';
    END IF;

    SELECT 
        id, 
        status, 
        assignment_type, 
        test_access_mode, 
        test_attempt_policy, 
        test_max_attempts
    INTO v_assessment
    FROM public.assessment_events
    WHERE id = p_assessment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment event not found';
    END IF;

    IF v_assessment.status != 'Live' THEN
        RAISE EXCEPTION 'Assessment is not Live';
    END IF;

    IF v_assessment.assignment_type = 'PRODUCTION' THEN
        IF v_caller_role = 'admin' THEN
            RAISE EXCEPTION 'Admins cannot start production assessments. Use a TEST assignment to verify papers.';
        END IF;
        IF v_caller_role NOT IN ('student', 'tester') THEN
            RAISE EXCEPTION 'Unauthorized role for production assessment: %', v_caller_role;
        END IF;
    ELSIF v_assessment.assignment_type = 'TEST' THEN
        IF v_assessment.test_access_mode = 'TESTER_ONLY' THEN
            IF v_caller_role NOT IN ('tester', 'admin') THEN
                RAISE EXCEPTION 'Access denied: This test assignment is restricted to testers';
            END IF;
        ELSIF v_assessment.test_access_mode = 'ALL_ENROLLED' THEN
            IF v_caller_role NOT IN ('student', 'tester', 'admin') THEN
                RAISE EXCEPTION 'Unauthorized role: %', v_caller_role;
            END IF;
        END IF;
    END IF;

    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(v_caller_id::text || ':' || p_assessment_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    v_requires_enrollment := (
        v_assessment.assignment_type = 'PRODUCTION' OR
        (v_assessment.assignment_type = 'TEST' AND v_assessment.test_access_mode = 'ALL_ENROLLED' AND v_caller_role != 'admin')
    );

    FOR v_as_id IN SELECT pg_catalog.unnest(p_assessment_subject_ids) LOOP
        SELECT id, subject_id, paper_set_version_id
        INTO v_as
        FROM public.assessment_subjects
        WHERE id = v_as_id AND assessment_event_id = p_assessment_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Assessment subject % does not belong to this assessment', v_as_id;
        END IF;

        IF v_as.paper_set_version_id IS NULL THEN
            RAISE EXCEPTION 'Assessment subject % does not have a published paper assigned', v_as_id;
        END IF;

        IF v_requires_enrollment THEN
            SELECT EXISTS (
                SELECT 1 
                FROM public.student_enrollments
                WHERE student_id = v_caller_id 
                  AND subject_id = v_as.subject_id 
                  AND is_active = true
            ) INTO v_enrolled;

            IF NOT v_enrolled THEN
                RAISE EXCEPTION 'Student is not actively enrolled in subject for assessment_subject %', v_as_id;
            END IF;
        END IF;
    END LOOP;

    FOR v_as_id IN SELECT pg_catalog.unnest(p_assessment_subject_ids) LOOP
        SELECT id, subject_id, paper_set_version_id
        INTO v_as
        FROM public.assessment_subjects
        WHERE id = v_as_id;

        SELECT id, attempt_number, status, is_test, paper_set_version_id
        INTO v_current_attempt
        FROM public.attempts
        WHERE student_id = v_caller_id
          AND assessment_subject_id = v_as_id
          AND status = 'Live'
        LIMIT 1;

        IF FOUND THEN
            IF v_current_attempt.is_test != (v_assessment.assignment_type = 'TEST') THEN
                RAISE EXCEPTION 'Security conflict: Live attempt test status does not match current assessment type';
            END IF;
            IF v_current_attempt.paper_set_version_id != v_as.paper_set_version_id THEN
                RAISE EXCEPTION 'Security conflict: Live attempt paper version does not match published paper version';
            END IF;

            v_attempt_ids := pg_catalog.array_append(v_attempt_ids, v_current_attempt.id);
        ELSE
            IF v_assessment.assignment_type = 'PRODUCTION' THEN
                IF EXISTS (
                    SELECT 1 
                    FROM public.attempts 
                    WHERE student_id = v_caller_id 
                      AND assessment_subject_id = v_as_id
                ) THEN
                    RAISE EXCEPTION 'Production assessment already attempted. Retakes are not allowed.';
                END IF;

                v_next_attempt_number := 1;
            ELSE
                SELECT pg_catalog.count(*)::integer, COALESCE(pg_catalog.max(attempt_number), 0) + 1
                INTO v_existing_count, v_next_attempt_number
                FROM public.attempts
                WHERE student_id = v_caller_id
                  AND assessment_subject_id = v_as_id;

                IF v_assessment.test_attempt_policy = 'LIMITED' THEN
                    IF v_existing_count >= v_assessment.test_max_attempts THEN
                        RAISE EXCEPTION 'Maximum test attempts (%) reached for this subject', v_assessment.test_max_attempts;
                    END IF;
                END IF;
            END IF;

            INSERT INTO public.attempts (
                student_id,
                assessment_subject_id,
                paper_set_version_id,
                attempt_number,
                is_test,
                status,
                start_time
            ) VALUES (
                v_caller_id,
                v_as_id,
                v_as.paper_set_version_id,
                v_next_attempt_number,
                (v_assessment.assignment_type = 'TEST'),
                'Live',
                pg_catalog.now()
            )
            RETURNING id INTO v_new_attempt_id;

            v_attempt_ids := pg_catalog.array_append(v_attempt_ids, v_new_attempt_id);
        END IF;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'student_id', v_caller_id,
        'attempt_ids', v_attempt_ids,
        'is_test', (v_assessment.assignment_type = 'TEST')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_student_attempts(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_student_attempts(UUID, UUID[]) TO authenticated;
