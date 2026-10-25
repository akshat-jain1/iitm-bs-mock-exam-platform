-- ==============================================================================
-- 20261007000019_seed_foundation_subjects.sql
-- Seed Core Reference Foundation Subjects (IITM Foundation Level)
-- ==============================================================================

INSERT INTO public.subjects (code, name) VALUES
    ('CT101',   'Computational Thinking'),
    ('ENG101',  'English 1'),
    ('ENG102',  'English 2'),
    ('MATH101', 'Mathematics 1'),
    ('MATH102', 'Mathematics 2'),
    ('PY101',   'Programming in Python'),
    ('STAT101', 'Statistics 1'),
    ('STAT102', 'Statistics 2')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
