-- ==============================================================================
-- PHASE 4B.2: SUPABASE AUTH & ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- 1. LINK PUBLIC.USERS TO AUTH.USERS
-- Ensure exact 1:1 mapping by adding a foreign key from public.users to auth.users.
ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. AUTOMATIC PROFILE CREATION TRIGGER
-- Trigger to automatically create the domain user record when an auth user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, role, name, email)
  VALUES (
    new.id,
    'student', -- Always default to student. Privilege escalation impossible from client.
    COALESCE(new.raw_user_meta_data->>'full_name', 'Student'),
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. SECURITY DEFINER ROLE GETTER
-- Securely fetch the current user's role bypassing RLS on public.users.
-- This prevents infinite recursion when evaluating RLS policies that depend on role.
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 4. ENABLE RLS ON ALL DOMAIN TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.paper_set_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_content_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_mcq_msq_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_numeric_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.paper_set_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_content_node_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_mcq_msq_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_numeric_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES

-- USERS
-- Students can read only their own profile. Admins read all. No client-side modifications.
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.users FOR SELECT USING (public.get_auth_user_role() = 'admin');

-- SUBJECTS & ASSESSMENT TYPES
CREATE POLICY "Anyone can read subjects" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR ALL USING (public.get_auth_user_role() = 'admin');

CREATE POLICY "Anyone can read assessment types" ON public.assessment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage assessment types" ON public.assessment_types FOR ALL USING (public.get_auth_user_role() = 'admin');

-- STUDENT ENROLLMENTS
CREATE POLICY "Students can read own enrollments" ON public.student_enrollments FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Admins can manage enrollments" ON public.student_enrollments FOR ALL USING (public.get_auth_user_role() = 'admin');

-- TEMPLATES (ADMIN ONLY)
CREATE POLICY "Admins can manage paper templates" ON public.paper_set_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage section templates" ON public.section_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage group templates" ON public.group_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage question templates" ON public.question_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage section content nodes" ON public.section_content_nodes FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage option templates" ON public.option_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage eval mcq templates" ON public.eval_mcq_msq_templates FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage eval numeric templates" ON public.eval_numeric_templates FOR ALL USING (public.get_auth_user_role() = 'admin');

-- VERSIONS (ADMIN MANAGES, STUDENTS READ VIA ATTEMPT)
-- Admins can do anything on versions (INSERT/SELECT). 
CREATE POLICY "Admins can manage paper versions" ON public.paper_set_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage section versions" ON public.section_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage group versions" ON public.group_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage question versions" ON public.question_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage section content node versions" ON public.section_content_node_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage option versions" ON public.option_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage eval mcq versions" ON public.eval_mcq_msq_versions FOR ALL USING (public.get_auth_user_role() = 'admin');
CREATE POLICY "Admins can manage eval numeric versions" ON public.eval_numeric_versions FOR ALL USING (public.get_auth_user_role() = 'admin');

-- Students can read versions ONLY IF they have an attempt referencing that paper version.
CREATE POLICY "Students can read paper versions via attempt" ON public.paper_set_versions FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.paper_set_version_id = paper_set_versions.id AND a.student_id = auth.uid()));

CREATE POLICY "Students can read section versions via attempt" ON public.section_versions FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.paper_set_version_id = section_versions.paper_set_version_id AND a.student_id = auth.uid()));

CREATE POLICY "Students can read group versions via attempt" ON public.group_versions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.section_versions sv 
  JOIN public.attempts a ON a.paper_set_version_id = sv.paper_set_version_id
  WHERE sv.id = group_versions.section_version_id AND a.student_id = auth.uid()
));

CREATE POLICY "Students can read question versions via attempt" ON public.question_versions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.section_versions sv 
  JOIN public.attempts a ON a.paper_set_version_id = sv.paper_set_version_id
  WHERE sv.id = question_versions.section_version_id AND a.student_id = auth.uid()
));

CREATE POLICY "Students can read option versions via attempt" ON public.option_versions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.question_versions qv
  JOIN public.section_versions sv ON sv.id = qv.section_version_id
  JOIN public.attempts a ON a.paper_set_version_id = sv.paper_set_version_id
  WHERE qv.id = option_versions.question_version_id AND a.student_id = auth.uid()
));

CREATE POLICY "Students can read section content node versions via attempt" ON public.section_content_node_versions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.section_versions sv 
  JOIN public.attempts a ON a.paper_set_version_id = sv.paper_set_version_id
  WHERE sv.id = section_content_node_versions.section_version_id AND a.student_id = auth.uid()
));

-- Note: Eval versions are explicitly NOT readable by students. They cannot see answer keys.

-- ASSESSMENT CONFIGURATION
CREATE POLICY "Anyone can read assessment events" ON public.assessment_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage assessment events" ON public.assessment_events FOR ALL USING (public.get_auth_user_role() = 'admin');

CREATE POLICY "Students can read assessment subjects if enrolled" ON public.assessment_subjects FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.student_enrollments e WHERE e.subject_id = assessment_subjects.subject_id AND e.student_id = auth.uid()));
CREATE POLICY "Admins can manage assessment subjects" ON public.assessment_subjects FOR ALL USING (public.get_auth_user_role() = 'admin');

-- ATTEMPTS
CREATE POLICY "Students can read own attempts" ON public.attempts FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own attempts" ON public.attempts FOR INSERT WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
        SELECT 1 
        FROM public.assessment_subjects asubj
        JOIN public.student_enrollments se ON se.subject_id = asubj.subject_id
        WHERE asubj.id = assessment_subject_id
          AND se.student_id = auth.uid()
          AND se.is_active = TRUE
    )
);

CREATE POLICY "Students can update own attempts" ON public.attempts FOR UPDATE USING (student_id = auth.uid());
CREATE POLICY "Admins can manage all attempts" ON public.attempts FOR ALL USING (public.get_auth_user_role() = 'admin');

-- ATTEMPT FIELD SECURITY TRIGGER
CREATE OR REPLACE FUNCTION public.enforce_student_attempt_restrictions()
RETURNS TRIGGER AS $$
BEGIN
    IF public.get_auth_user_role() = 'student' THEN
        IF TG_OP = 'INSERT' THEN
            -- Force authoritative fields on creation
            NEW.start_time = NOW();
            NEW.status = 'Live';
        ELSIF TG_OP = 'UPDATE' THEN
            -- Prevent backdating/changing start_time
            IF OLD.start_time != NEW.start_time THEN
                RAISE EXCEPTION 'Students cannot modify attempt start_time';
            END IF;
            -- Prevent setting server-controlled states
            IF NEW.status = 'Completed' THEN
                RAISE EXCEPTION 'Students cannot set status to Completed';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_student_attempt_security
BEFORE INSERT OR UPDATE ON public.attempts
FOR EACH ROW EXECUTE PROCEDURE public.enforce_student_attempt_restrictions();

-- RESPONSES
CREATE POLICY "Students can read own responses" ON public.responses FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = responses.attempt_id AND a.student_id = auth.uid()));

CREATE POLICY "Students can insert own responses" ON public.responses FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.question_versions q WHERE q.id = question_version_id)
);

CREATE POLICY "Students can update own responses" ON public.responses FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid()))
WITH CHECK (
    EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.question_versions q WHERE q.id = question_version_id)
);

CREATE POLICY "Admins can manage all responses" ON public.responses FOR ALL USING (public.get_auth_user_role() = 'admin');

-- RESULTS
CREATE POLICY "Students can read own results" ON public.results FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.attempts a WHERE a.id = results.attempt_id AND a.student_id = auth.uid()));
CREATE POLICY "Admins can manage results" ON public.results FOR ALL USING (public.get_auth_user_role() = 'admin');
