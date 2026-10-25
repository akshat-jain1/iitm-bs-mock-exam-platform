-- ==============================================================================
-- PHASE 4B.1: CORE DOMAIN SCHEMA
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- EXTENSIONS & CUSTOM TYPES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure extensions schema is in search_path for uuid-ossp
SET search_path TO public, extensions;

-- Guarantee uuid_generate_v4() is always available in public schema across all environments
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS UUID
LANGUAGE sql
AS $$ SELECT gen_random_uuid(); $$;

CREATE TYPE user_role AS ENUM ('admin', 'student');
CREATE TYPE exam_status AS ENUM ('Draft', 'Scheduled', 'Live', 'Completed', 'Archived');
CREATE TYPE verification_status AS ENUM ('Ready', 'Needs Review', 'Missing Image', 'Code Needs Review', 'Answer Needs Review', 'Extraction Warning');
CREATE TYPE question_type AS ENUM ('MCQ', 'MSQ', 'NUMERICAL');
CREATE TYPE numerical_eval_mode AS ENUM ('EXACT', 'RANGE');
CREATE TYPE content_node_type AS ENUM ('QUESTION', 'GROUP');
CREATE TYPE attempt_status AS ENUM ('Live', 'Submitted', 'Completed', 'Abandoned');

-- ------------------------------------------------------------------------------
-- ACADEMIC ORGANIZATION
-- ------------------------------------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role user_role NOT NULL DEFAULT 'student',
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assessment_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL
);

-- Seed Approved Assessment Types
INSERT INTO assessment_types (name) VALUES ('Quiz 1'), ('Quiz 2'), ('End Term');

CREATE TABLE student_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, subject_id)
);

-- Ensure only students can enroll
CREATE OR REPLACE FUNCTION verify_enrollment_role()
RETURNS TRIGGER AS $$
DECLARE v_role user_role;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = NEW.student_id;
    IF v_role != 'student' THEN
        RAISE EXCEPTION 'Only users with role student can be enrolled in subjects';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_enrollment_role BEFORE INSERT OR UPDATE ON student_enrollments FOR EACH ROW EXECUTE FUNCTION verify_enrollment_role();

-- Maximum 8 Subjects Enforcement
CREATE OR REPLACE FUNCTION enforce_max_enrollments()
RETURNS TRIGGER AS $$
DECLARE
    active_count INT;
BEGIN
    IF NEW.is_active = TRUE THEN
        PERFORM 1 FROM users WHERE id = NEW.student_id FOR UPDATE;
        
        SELECT COUNT(*) INTO active_count 
        FROM student_enrollments 
        WHERE student_id = NEW.student_id AND is_active = TRUE AND id != NEW.id;

        IF active_count >= 8 THEN
            RAISE EXCEPTION 'Student cannot exceed 8 active subject enrollments';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_max_enrollments BEFORE INSERT OR UPDATE ON student_enrollments FOR EACH ROW EXECUTE FUNCTION enforce_max_enrollments();

-- ------------------------------------------------------------------------------
-- AUTHORING (TEMPLATES)
-- ------------------------------------------------------------------------------

CREATE TABLE paper_set_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    assessment_type_id UUID NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    reference_material JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('Draft', 'Imported_Draft', 'Ready'))
);

CREATE TABLE section_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paper_set_id UUID NOT NULL REFERENCES paper_set_templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    reference_material JSONB
);

CREATE TABLE group_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES section_templates(id) ON DELETE CASCADE,
    title TEXT,
    passage TEXT,
    image_assets JSONB,
    code_content JSONB,
    reference_material JSONB
);

CREATE TABLE question_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID REFERENCES section_templates(id) ON DELETE CASCADE,
    group_id UUID REFERENCES group_templates(id) ON DELETE CASCADE,
    type question_type NOT NULL,
    text TEXT NOT NULL,
    marks NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    verification_status verification_status NOT NULL DEFAULT 'Ready',
    image_assets JSONB,
    code_content JSONB,
    source TEXT,
    CHECK ((section_id IS NOT NULL AND group_id IS NULL) OR (section_id IS NULL AND group_id IS NOT NULL)),
    CHECK (marks > 0)
);

CREATE TABLE section_content_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES section_templates(id) ON DELETE CASCADE,
    node_type content_node_type NOT NULL,
    question_id UUID REFERENCES question_templates(id) ON DELETE CASCADE,
    group_id UUID REFERENCES group_templates(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    UNIQUE(section_id, sequence),
    CHECK (sequence >= 1),
    CHECK (
        (node_type = 'QUESTION' AND question_id IS NOT NULL AND group_id IS NULL) OR
        (node_type = 'GROUP' AND group_id IS NOT NULL AND question_id IS NULL)
    )
);

-- Verify Section Content Membership Integrity
CREATE OR REPLACE FUNCTION verify_content_node_membership()
RETURNS TRIGGER AS $$
DECLARE v_actual_section UUID;
BEGIN
    IF NEW.node_type = 'QUESTION' THEN
        SELECT COALESCE(q.section_id, g.section_id) INTO v_actual_section
        FROM question_templates q LEFT JOIN group_templates g ON q.group_id = g.id
        WHERE q.id = NEW.question_id;
    ELSE
        SELECT section_id INTO v_actual_section FROM group_templates WHERE id = NEW.group_id;
    END IF;

    IF v_actual_section != NEW.section_id THEN
        RAISE EXCEPTION 'Content node does not belong to the target section';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_content_node_membership BEFORE INSERT OR UPDATE ON section_content_nodes FOR EACH ROW EXECUTE FUNCTION verify_content_node_membership();

CREATE TABLE option_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES question_templates(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sequence INT NOT NULL,
    UNIQUE(question_id, sequence),
    CHECK (sequence >= 1)
);

CREATE TABLE eval_mcq_msq_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES question_templates(id) ON DELETE CASCADE,
    correct_option_id UUID NOT NULL REFERENCES option_templates(id) ON DELETE CASCADE,
    UNIQUE(question_id, correct_option_id)
);

CREATE TABLE eval_numeric_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES question_templates(id) ON DELETE CASCADE,
    mode numerical_eval_mode NOT NULL,
    exact_val NUMERIC,
    min_val NUMERIC,
    max_val NUMERIC,
    UNIQUE(question_id),
    CHECK (
        (mode = 'EXACT' AND exact_val IS NOT NULL AND min_val IS NULL AND max_val IS NULL) OR
        (mode = 'RANGE' AND exact_val IS NULL AND min_val IS NOT NULL AND max_val IS NOT NULL AND min_val <= max_val)
    )
);

-- Verify Evaluation Type Matches Question Type
CREATE OR REPLACE FUNCTION verify_eval_type_match()
RETURNS TRIGGER AS $$
DECLARE v_type question_type;
BEGIN
    SELECT type INTO v_type FROM question_templates WHERE id = NEW.question_id;
    
    IF TG_TABLE_NAME = 'eval_mcq_msq_templates' AND v_type = 'NUMERICAL' THEN
        RAISE EXCEPTION 'NUMERICAL questions cannot have MCQ/MSQ evaluation';
    END IF;
    
    IF TG_TABLE_NAME = 'eval_numeric_templates' AND (v_type = 'MCQ' OR v_type = 'MSQ') THEN
        RAISE EXCEPTION 'MCQ/MSQ questions cannot have NUMERICAL evaluation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_eval_mcq_type BEFORE INSERT OR UPDATE ON eval_mcq_msq_templates FOR EACH ROW EXECUTE FUNCTION verify_eval_type_match();
CREATE TRIGGER check_eval_num_type BEFORE INSERT OR UPDATE ON eval_numeric_templates FOR EACH ROW EXECUTE FUNCTION verify_eval_type_match();

CREATE OR REPLACE FUNCTION verify_option_belongs_to_question_template()
RETURNS TRIGGER AS $$
DECLARE v_q_id UUID;
BEGIN
    SELECT question_id INTO v_q_id FROM option_templates WHERE id = NEW.correct_option_id;
    IF v_q_id != NEW.question_id THEN
        RAISE EXCEPTION 'Option does not belong to the question';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_option_question_integrity_template BEFORE INSERT OR UPDATE ON eval_mcq_msq_templates FOR EACH ROW EXECUTE FUNCTION verify_option_belongs_to_question_template();

-- Validation function intended to be called when attempting to publish/version a Paper Set
-- Guarantees exact evaluation cardinality at publish time without restricting draft saving.
CREATE OR REPLACE FUNCTION validate_paper_for_publishing(p_paper_set_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_invalid UUID;
BEGIN
    -- Check MCQ exactly 1 correct option
    SELECT q.id INTO v_invalid
    FROM question_templates q
    LEFT JOIN section_templates s ON q.section_id = s.id
    LEFT JOIN group_templates g ON q.group_id = g.id
    LEFT JOIN section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'MCQ'
      AND (SELECT COUNT(*) FROM eval_mcq_msq_templates e WHERE e.question_id = q.id) != 1
    LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Validation Failed: MCQ question % does not have exactly 1 correct option', v_invalid; END IF;

    -- Check MSQ at least 1 correct option
    SELECT q.id INTO v_invalid
    FROM question_templates q
    LEFT JOIN section_templates s ON q.section_id = s.id
    LEFT JOIN group_templates g ON q.group_id = g.id
    LEFT JOIN section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'MSQ'
      AND (SELECT COUNT(*) FROM eval_mcq_msq_templates e WHERE e.question_id = q.id) = 0
    LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Validation Failed: MSQ question % must have at least 1 correct option', v_invalid; END IF;

    -- Check Numerical has exactly 1 config
    SELECT q.id INTO v_invalid
    FROM question_templates q
    LEFT JOIN section_templates s ON q.section_id = s.id
    LEFT JOIN group_templates g ON q.group_id = g.id
    LEFT JOIN section_templates gs ON g.section_id = gs.id
    WHERE (s.paper_set_id = p_paper_set_id OR gs.paper_set_id = p_paper_set_id)
      AND q.type = 'NUMERICAL'
      AND (SELECT COUNT(*) FROM eval_numeric_templates e WHERE e.question_id = q.id) != 1
    LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Validation Failed: NUMERICAL question % missing numerical evaluation config', v_invalid; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- VERSIONING (IMMUTABLE SNAPSHOTS)
-- ------------------------------------------------------------------------------

CREATE TABLE paper_set_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloned_from_id UUID REFERENCES paper_set_templates(id) ON DELETE SET NULL,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    assessment_type_id UUID NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    reference_material JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE section_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloned_from_id UUID REFERENCES section_templates(id) ON DELETE SET NULL,
    paper_set_version_id UUID NOT NULL REFERENCES paper_set_versions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    reference_material JSONB
);

CREATE TABLE group_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloned_from_id UUID REFERENCES group_templates(id) ON DELETE SET NULL,
    section_version_id UUID NOT NULL REFERENCES section_versions(id) ON DELETE CASCADE,
    title TEXT,
    passage TEXT,
    image_assets JSONB,
    code_content JSONB,
    reference_material JSONB
);

CREATE TABLE question_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloned_from_id UUID REFERENCES question_templates(id) ON DELETE SET NULL,
    section_version_id UUID REFERENCES section_versions(id) ON DELETE CASCADE,
    group_version_id UUID REFERENCES group_versions(id) ON DELETE CASCADE,
    type question_type NOT NULL,
    text TEXT NOT NULL,
    marks NUMERIC(5,2) NOT NULL,
    image_assets JSONB,
    code_content JSONB,
    CHECK ((section_version_id IS NOT NULL AND group_version_id IS NULL) OR (section_version_id IS NULL AND group_version_id IS NOT NULL)),
    CHECK (marks > 0)
);

CREATE TABLE section_content_node_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_version_id UUID NOT NULL REFERENCES section_versions(id) ON DELETE CASCADE,
    node_type content_node_type NOT NULL,
    question_version_id UUID REFERENCES question_versions(id) ON DELETE CASCADE,
    group_version_id UUID REFERENCES group_versions(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    UNIQUE(section_version_id, sequence),
    CHECK (sequence >= 1),
    CHECK (
        (node_type = 'QUESTION' AND question_version_id IS NOT NULL AND group_version_id IS NULL) OR
        (node_type = 'GROUP' AND group_version_id IS NOT NULL AND question_version_id IS NULL)
    )
);

CREATE OR REPLACE FUNCTION verify_content_node_membership_version()
RETURNS TRIGGER AS $$
DECLARE v_actual_section UUID;
BEGIN
    IF NEW.node_type = 'QUESTION' THEN
        SELECT COALESCE(q.section_version_id, g.section_version_id) INTO v_actual_section
        FROM question_versions q LEFT JOIN group_versions g ON q.group_version_id = g.id
        WHERE q.id = NEW.question_version_id;
    ELSE
        SELECT section_version_id INTO v_actual_section FROM group_versions WHERE id = NEW.group_version_id;
    END IF;

    IF v_actual_section != NEW.section_version_id THEN
        RAISE EXCEPTION 'Content node version does not belong to the target section version';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_content_node_membership_ver BEFORE INSERT OR UPDATE ON section_content_node_versions FOR EACH ROW EXECUTE FUNCTION verify_content_node_membership_version();

CREATE TABLE option_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cloned_from_id UUID REFERENCES option_templates(id) ON DELETE SET NULL,
    question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sequence INT NOT NULL,
    UNIQUE(question_version_id, sequence),
    CHECK (sequence >= 1)
);

CREATE TABLE eval_mcq_msq_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    correct_option_version_id UUID NOT NULL REFERENCES option_versions(id) ON DELETE CASCADE,
    UNIQUE(question_version_id, correct_option_version_id)
);

CREATE TABLE eval_numeric_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    mode numerical_eval_mode NOT NULL,
    exact_val NUMERIC,
    min_val NUMERIC,
    max_val NUMERIC,
    UNIQUE(question_version_id),
    CHECK (
        (mode = 'EXACT' AND exact_val IS NOT NULL AND min_val IS NULL AND max_val IS NULL) OR
        (mode = 'RANGE' AND exact_val IS NULL AND min_val IS NOT NULL AND max_val IS NOT NULL AND min_val <= max_val)
    )
);

CREATE OR REPLACE FUNCTION verify_eval_type_match_version()
RETURNS TRIGGER AS $$
DECLARE v_type question_type;
BEGIN
    SELECT type INTO v_type FROM question_versions WHERE id = NEW.question_version_id;
    
    IF TG_TABLE_NAME = 'eval_mcq_msq_versions' AND v_type = 'NUMERICAL' THEN
        RAISE EXCEPTION 'NUMERICAL questions cannot have MCQ/MSQ evaluation';
    END IF;
    
    IF TG_TABLE_NAME = 'eval_numeric_versions' AND (v_type = 'MCQ' OR v_type = 'MSQ') THEN
        RAISE EXCEPTION 'MCQ/MSQ questions cannot have NUMERICAL evaluation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_eval_mcq_type_ver BEFORE INSERT OR UPDATE ON eval_mcq_msq_versions FOR EACH ROW EXECUTE FUNCTION verify_eval_type_match_version();
CREATE TRIGGER check_eval_num_type_ver BEFORE INSERT OR UPDATE ON eval_numeric_versions FOR EACH ROW EXECUTE FUNCTION verify_eval_type_match_version();

CREATE OR REPLACE FUNCTION verify_option_belongs_to_question_version()
RETURNS TRIGGER AS $$
DECLARE v_q_id UUID;
BEGIN
    SELECT question_version_id INTO v_q_id FROM option_versions WHERE id = NEW.correct_option_version_id;
    IF v_q_id != NEW.question_version_id THEN
        RAISE EXCEPTION 'Option does not belong to the question version';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_option_question_integrity_version BEFORE INSERT OR UPDATE ON eval_mcq_msq_versions FOR EACH ROW EXECUTE FUNCTION verify_option_belongs_to_question_version();

-- Enforce Immutability on Versions (No Update, No Delete)
CREATE OR REPLACE FUNCTION prevent_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Historical paper versions are immutable and cannot be updated or directly deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_paper_version_immutability BEFORE UPDATE OR DELETE ON paper_set_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_section_version_immutability BEFORE UPDATE OR DELETE ON section_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_group_version_immutability BEFORE UPDATE OR DELETE ON group_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_question_version_immutability BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_option_version_immutability BEFORE UPDATE OR DELETE ON option_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_eval_mcq_immutability BEFORE UPDATE OR DELETE ON eval_mcq_msq_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();
CREATE TRIGGER enforce_eval_num_immutability BEFORE UPDATE OR DELETE ON eval_numeric_versions FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();

-- ------------------------------------------------------------------------------
-- EXECUTION & EVENT CONFIGURATION
-- ------------------------------------------------------------------------------

CREATE TABLE assessment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_type_id UUID NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    scheduled_start TIMESTAMPTZ,
    duration_mins INT NOT NULL,
    status exam_status NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (duration_mins > 0)
);

CREATE OR REPLACE FUNCTION prevent_event_type_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.assessment_type_id != NEW.assessment_type_id THEN
        IF EXISTS (SELECT 1 FROM assessment_subjects WHERE assessment_event_id = NEW.id) THEN
            RAISE EXCEPTION 'Cannot change Assessment Type of an event that has assigned subjects';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_event_type_update BEFORE UPDATE ON assessment_events FOR EACH ROW EXECUTE FUNCTION prevent_event_type_update();

CREATE TABLE assessment_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_event_id UUID NOT NULL REFERENCES assessment_events(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    paper_set_version_id UUID NOT NULL REFERENCES paper_set_versions(id) ON DELETE RESTRICT,
    UNIQUE(assessment_event_id, subject_id)
);

-- Integrity check: Paper Version must match the Event's Assessment Type and Subject
CREATE OR REPLACE FUNCTION verify_assessment_subject_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_event_type UUID;
    v_paper_type UUID;
    v_paper_subj UUID;
BEGIN
    SELECT assessment_type_id INTO v_event_type FROM assessment_events WHERE id = NEW.assessment_event_id;
    SELECT assessment_type_id, subject_id INTO v_paper_type, v_paper_subj FROM paper_set_versions WHERE id = NEW.paper_set_version_id;

    IF v_event_type != v_paper_type THEN
        RAISE EXCEPTION 'Paper Version Assessment Type does not match the Event Assessment Type';
    END IF;
    
    IF NEW.subject_id != v_paper_subj THEN
        RAISE EXCEPTION 'Paper Version Subject does not match the assigned Subject';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_assessment_subject_integrity BEFORE INSERT OR UPDATE ON assessment_subjects FOR EACH ROW EXECUTE FUNCTION verify_assessment_subject_integrity();

-- Freeze assessment subject identity after an attempt exists
CREATE OR REPLACE FUNCTION freeze_assessment_subject_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.assessment_event_id != NEW.assessment_event_id OR 
       OLD.subject_id != NEW.subject_id OR 
       OLD.paper_set_version_id != NEW.paper_set_version_id THEN
       
        IF EXISTS (SELECT 1 FROM attempts WHERE assessment_subject_id = NEW.id) THEN
            RAISE EXCEPTION 'Cannot modify Assessment Subject identity fields after an attempt exists';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_assessment_subject_freeze BEFORE UPDATE ON assessment_subjects FOR EACH ROW EXECUTE FUNCTION freeze_assessment_subject_identity();

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assessment_subject_id UUID NOT NULL REFERENCES assessment_subjects(id) ON DELETE RESTRICT,
    paper_set_version_id UUID NOT NULL REFERENCES paper_set_versions(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status attempt_status NOT NULL DEFAULT 'Live',
    UNIQUE(student_id, assessment_subject_id)
);

CREATE OR REPLACE FUNCTION verify_attempt_paper_version()
RETURNS TRIGGER AS $$
DECLARE v_subj_paper_id UUID;
BEGIN
    SELECT paper_set_version_id INTO v_subj_paper_id FROM assessment_subjects WHERE id = NEW.assessment_subject_id;
    IF NEW.paper_set_version_id != v_subj_paper_id THEN
        RAISE EXCEPTION 'Attempt paper version does not match the Assessment Subject paper version';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_attempt_paper_version BEFORE INSERT OR UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION verify_attempt_paper_version();

-- Freeze attempt identity fields permanently
CREATE OR REPLACE FUNCTION freeze_attempt_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.student_id != NEW.student_id OR 
       OLD.assessment_subject_id != NEW.assessment_subject_id OR 
       OLD.paper_set_version_id != NEW.paper_set_version_id THEN
        RAISE EXCEPTION 'Attempt identity fields (student, assessment subject, paper version) are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_attempt_identity_freeze BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION freeze_attempt_identity();

CREATE TABLE responses (
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
    data JSONB NOT NULL,
    last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (attempt_id, question_version_id)
);

CREATE OR REPLACE FUNCTION verify_response_question_version()
RETURNS TRIGGER AS $$
DECLARE v_attempt_paper_version UUID;
DECLARE q_paper_version UUID;
BEGIN
    SELECT paper_set_version_id INTO v_attempt_paper_version FROM attempts WHERE id = NEW.attempt_id;
    
    SELECT COALESCE(s.paper_set_version_id, gs.paper_set_version_id) INTO q_paper_version
    FROM question_versions q
    LEFT JOIN section_versions s ON q.section_version_id = s.id
    LEFT JOIN group_versions g ON q.group_version_id = g.id
    LEFT JOIN section_versions gs ON g.section_version_id = gs.id
    WHERE q.id = NEW.question_version_id;

    IF v_attempt_paper_version != q_paper_version THEN
        RAISE EXCEPTION 'Question Version does not belong to the Attempt Paper Version';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_response_question_version BEFORE INSERT OR UPDATE ON responses FOR EACH ROW EXECUTE FUNCTION verify_response_question_version();

CREATE TABLE results (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    score NUMERIC(7,2) NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'Pending Review',
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- CRITICAL INDEXES
-- ------------------------------------------------------------------------------

-- Enrollment lookups
CREATE INDEX idx_student_enrollments_student ON student_enrollments(student_id);
CREATE INDEX idx_student_enrollments_subject ON student_enrollments(subject_id);

-- Authoring hierarchy
CREATE INDEX idx_paper_templates_subject_type ON paper_set_templates(subject_id, assessment_type_id);
CREATE INDEX idx_section_templates_paper ON section_templates(paper_set_id);
CREATE INDEX idx_question_templates_section ON question_templates(section_id);
CREATE INDEX idx_question_templates_group ON question_templates(group_id);

-- Version hierarchy for fast RPC / Read Model
CREATE INDEX idx_paper_versions_subject_type ON paper_set_versions(subject_id, assessment_type_id);
CREATE INDEX idx_section_versions_paper ON section_versions(paper_set_version_id);
CREATE INDEX idx_group_versions_section ON group_versions(section_version_id);
CREATE INDEX idx_question_versions_section ON question_versions(section_version_id);
CREATE INDEX idx_question_versions_group ON question_versions(group_version_id);
CREATE INDEX idx_option_versions_question ON option_versions(question_version_id);
CREATE INDEX idx_content_node_versions_section ON section_content_node_versions(section_version_id);

-- Event mappings
CREATE INDEX idx_assessment_subjects_event ON assessment_subjects(assessment_event_id);
CREATE INDEX idx_assessment_subjects_subject ON assessment_subjects(subject_id);

-- Execution execution
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_assmt_subject ON attempts(assessment_subject_id);
CREATE INDEX idx_attempts_paper_version ON attempts(paper_set_version_id);
