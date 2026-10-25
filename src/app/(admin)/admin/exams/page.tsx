import React from "react";
import { createClient } from "@/lib/supabase/server";
import { ExamListClient, AssessmentEventSummary } from "./ExamListClient";
import type { AssessmentAssignmentType, TestAccessMode, TestAttemptPolicy } from "@/lib/types/assessment";

interface RawAssessmentEventRow {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  assessment_type_id: string;
  assignment_type?: AssessmentAssignmentType;
  test_access_mode?: TestAccessMode | null;
  test_attempt_policy?: TestAttemptPolicy | null;
  test_max_attempts?: number | null;
  test_duration_mins?: number | null;
  assessment_types: { id: string; name: string } | { id: string; name: string }[];
}

export default async function ExamsPage() {
  const supabase = await createClient();

  // 1. Fetch Events, Assessment Types, Assessment Subjects, and Attempts concurrently
  const [eventsRes, typesRes, subjectsRes, attemptsRes] = await Promise.all([
    supabase
      .from("assessment_events")
      .select(`
        id,
        title,
        status,
        scheduled_start,
        assessment_type_id,
        assignment_type,
        test_access_mode,
        test_attempt_policy,
        test_max_attempts,
        test_duration_mins,
        assessment_types!inner ( id, name )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("assessment_types")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("assessment_subjects")
      .select("id, assessment_event_id"),
    supabase
      .from("attempts")
      .select("assessment_subject_id"),
  ]);

  if (eventsRes.error) {
    const errPayload = {
      code: eventsRes.error.code,
      message: eventsRes.error.message,
      details: eventsRes.error.details,
      hint: eventsRes.error.hint,
    };
    console.error("Error fetching assessment events:", errPayload);
    throw new Error(`Failed to fetch assessment events: [${errPayload.code}] ${errPayload.message}`);
  }

  if (typesRes.error) {
    const errPayload = {
      code: typesRes.error.code,
      message: typesRes.error.message,
      details: typesRes.error.details,
      hint: typesRes.error.hint,
    };
    console.error("Error fetching assessment types:", errPayload);
    throw new Error(`Failed to fetch assessment types: [${errPayload.code}] ${errPayload.message}`);
  }

  if (subjectsRes.error) {
    const errPayload = {
      code: subjectsRes.error.code,
      message: subjectsRes.error.message,
      details: subjectsRes.error.details,
      hint: subjectsRes.error.hint,
    };
    console.error("Error fetching assessment subjects:", errPayload);
    throw new Error(`Failed to fetch assessment subjects: [${errPayload.code}] ${errPayload.message}`);
  }

  if (attemptsRes.error) {
    const errPayload = {
      code: attemptsRes.error.code,
      message: attemptsRes.error.message,
      details: attemptsRes.error.details,
      hint: attemptsRes.error.hint,
    };
    console.error("Error fetching attempts:", errPayload);
    throw new Error(`Failed to fetch attempts: [${errPayload.code}] ${errPayload.message}`);
  }

  const rawEvents = eventsRes.data || [];
  const assessmentTypes = typesRes.data || [];
  const assessmentSubjects = subjectsRes.data || [];
  const attempts = attemptsRes.data || [];

  // 2. Compute subject counts and attempt counts per event
  const subjectCounts: Record<string, number> = {};
  const asubjToEventMap: Record<string, string> = {};
  (assessmentSubjects || []).forEach((asubj) => {
    subjectCounts[asubj.assessment_event_id] = (subjectCounts[asubj.assessment_event_id] || 0) + 1;
    asubjToEventMap[asubj.id] = asubj.assessment_event_id;
  });

  const attemptCounts: Record<string, number> = {};
  (attempts || []).forEach((att) => {
    const eventId = asubjToEventMap[att.assessment_subject_id];
    if (eventId) {
      attemptCounts[eventId] = (attemptCounts[eventId] || 0) + 1;
    }
  });

  const formattedEvents: AssessmentEventSummary[] = ((rawEvents || []) as unknown as RawAssessmentEventRow[]).map((e) => {
    const aType = Array.isArray(e.assessment_types) ? e.assessment_types[0] : e.assessment_types;

    return {
      id: e.id,
      title: e.title,
      status: e.status,
      scheduled_start: e.scheduled_start,
      assessment_type_id: e.assessment_type_id,
      assignment_type: e.assignment_type || "PRODUCTION",
      test_access_mode: e.test_access_mode || null,
      test_attempt_policy: e.test_attempt_policy || null,
      test_max_attempts: e.test_max_attempts ?? null,
      test_duration_mins: e.test_duration_mins ?? null,
      assessment_types: aType,
      subject_count: subjectCounts[e.id] || 0,
      attempt_count: attemptCounts[e.id] || 0,
    };
  });

  return (
    <ExamListClient
      events={formattedEvents}
      assessmentTypes={assessmentTypes || []}
    />
  );
}
