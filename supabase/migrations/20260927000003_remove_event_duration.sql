-- Remove duration_mins from assessment_events because duration is dynamically calculated 
-- based on the number of selected subjects in the student's exam session.

ALTER TABLE public.assessment_events 
DROP COLUMN IF EXISTS duration_mins;
