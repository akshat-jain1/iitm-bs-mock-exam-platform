import React from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamManagementClient } from "./ExamManagementClient";
import type { AssessmentAssignmentType, TestAccessMode, TestAttemptPolicy } from "@/lib/types/assessment";

interface EventQueryResult {
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

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ExamManagementPage({ params }: PageProps) {
  const resolvedParams = await params;
  const supabase = await createClient();

  // 1. Fetch Event
  const { data: event, error: eventError } = await supabase
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
    .eq("id", resolvedParams.examId)
    .single();

  if (eventError || !event) {
    notFound();
  }

  // 2. Fetch Assigned Subjects with linked Paper Versions
  const { data: rawAssignedSubjects } = await supabase
    .from("assessment_subjects")
    .select(`
      id,
      subject_id,
      paper_set_version_id,
      subjects!inner ( id, name, code ),
      paper_set_versions!inner ( id, title, created_at )
    `)
    .eq("assessment_event_id", resolvedParams.examId);

  const asubjIds = (rawAssignedSubjects || []).map((s) => s.id);

  // 3. Count attempts per assigned subject
  const attemptCounts: Record<string, number> = {};
  if (asubjIds.length > 0) {
    const { data: attempts } = await supabase
      .from("attempts")
      .select("assessment_subject_id")
      .in("assessment_subject_id", asubjIds);

    (attempts || []).forEach((a) => {
      attemptCounts[a.assessment_subject_id] = (attemptCounts[a.assessment_subject_id] || 0) + 1;
    });
  }

  // 4. Fetch All Subjects for dropdown
  const { data: allSubjects } = await supabase
    .from("subjects")
    .select("id, name, code")
    .order("code", { ascending: true });

  // 5. Fetch all published paper versions matching the event's assessment type
  const { data: availablePaperVersions } = await supabase
    .from("paper_set_versions")
    .select("id, title, subject_id, assessment_type_id, created_at")
    .eq("assessment_type_id", event.assessment_type_id)
    .order("created_at", { ascending: false });

  const formattedAssignedSubjects = (rawAssignedSubjects || []).map((asubj) => {
    const subj = Array.isArray(asubj.subjects) ? asubj.subjects[0] : asubj.subjects;
    const pver = Array.isArray(asubj.paper_set_versions) ? asubj.paper_set_versions[0] : asubj.paper_set_versions;

    return {
      id: asubj.id,
      subject_id: asubj.subject_id,
      paper_set_version_id: asubj.paper_set_version_id,
      subjects: subj as unknown as { id: string; name: string; code: string },
      paper_set_versions: pver as unknown as { id: string; title: string; created_at: string },
      attempt_count: attemptCounts[asubj.id] || 0,
    };
  });

  const typedEvent = event as unknown as EventQueryResult;
  const eventProps = {
    id: typedEvent.id,
    title: typedEvent.title,
    status: typedEvent.status,
    scheduled_start: typedEvent.scheduled_start,
    assessment_type_id: typedEvent.assessment_type_id,
    assignment_type: typedEvent.assignment_type || "PRODUCTION",
    test_access_mode: typedEvent.test_access_mode || null,
    test_attempt_policy: typedEvent.test_attempt_policy || null,
    test_max_attempts: typedEvent.test_max_attempts ?? null,
    test_duration_mins: typedEvent.test_duration_mins ?? null,
    assessment_types: Array.isArray(typedEvent.assessment_types)
      ? typedEvent.assessment_types[0]
      : typedEvent.assessment_types,
  };

  return (
    <ExamManagementClient
      event={eventProps}
      assignedSubjects={formattedAssignedSubjects}
      allSubjects={allSubjects || []}
      availablePaperVersions={availablePaperVersions || []}
    />
  );
}
