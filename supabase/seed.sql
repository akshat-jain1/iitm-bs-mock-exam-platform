-- ============================================================================
-- IITM Test Platform — Production Master Reference Seed Data
-- ============================================================================
-- PRODUCTION-SAFE BASELINE containing ONLY:
-- 1. Required Core Reference Subjects (IITM Foundation Level)
-- 2. Core Assessment Types (Quiz 1, Quiz 2, End Term)
--
-- STRICT INVARIANTS:
-- - NO development accounts or test passwords
-- - NO fake students or faculty
-- - NO sample exams or mock papers
-- - NO fake enrollments, attempts, responses, or results
-- ============================================================================

DO $$
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. Core Reference Subjects (IITM Foundation Level)
    -- ------------------------------------------------------------------------
    INSERT INTO public.subjects (code, name) VALUES
        ('MATH101', 'Mathematics 1'),
        ('STAT101', 'Statistics 1'),
        ('ENG101',  'English 1'),
        ('CT101',   'Computational Thinking'),
        ('MATH102', 'Mathematics 2'),
        ('STAT102', 'Statistics 2'),
        ('ENG102',  'English 2'),
        ('PY101',   'Programming in Python')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

    -- ------------------------------------------------------------------------
    -- 2. Authoritative Assessment Types
    -- ------------------------------------------------------------------------
    INSERT INTO public.assessment_types (name) VALUES
        ('Quiz 1'),
        ('Quiz 2'),
        ('End Term')
    ON CONFLICT (name) DO NOTHING;

END $$;
