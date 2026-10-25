import React from "react";
import { createClient } from "@/lib/supabase/server";
import { PaperLibraryClient, PaperSetSummary } from "./PaperLibraryClient";

export default async function QuestionBankPage() {
  const supabase = await createClient();

  // 1. Fetch Paper Templates, Subjects, Assessment Types, Sections, Groups, and Questions concurrently
  const [
    papersRes,
    subjectsRes,
    typesRes,
    sectionsRes,
    groupsRes,
    questionsRes,
  ] = await Promise.all([
    supabase
      .from("paper_set_templates")
      .select(`
        id,
        title,
        status,
        created_at,
        updated_at,
        subject_id,
        assessment_type_id,
        subjects!inner ( id, name, code ),
        assessment_types!inner ( id, name )
      `)
      .order("updated_at", { ascending: false }),
    supabase
      .from("subjects")
      .select("id, name, code")
      .order("code", { ascending: true }),
    supabase
      .from("assessment_types")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("section_templates")
      .select("id, paper_set_id"),
    supabase
      .from("group_templates")
      .select("id, section_id"),
    supabase
      .from("question_templates")
      .select("id, section_id, group_id"),
  ]);

  const rawPapers = papersRes.data;
  if (papersRes.error) {
    console.error("Error fetching paper templates:", papersRes.error);
  }

  const subjects = subjectsRes.data;
  const assessmentTypes = typesRes.data;
  const allSections = sectionsRes.data;
  const allGroups = groupsRes.data;
  const allQuestions = questionsRes.data;

  // 2. Compute Section & Question counts
  const sectionCounts: Record<string, number> = {};
  const questionCounts: Record<string, number> = {};

  (allSections || []).forEach((sec) => {
    sectionCounts[sec.paper_set_id] = (sectionCounts[sec.paper_set_id] || 0) + 1;
  });

  const groupToSectionMap: Record<string, string> = {};
  (allGroups || []).forEach((g) => {
    groupToSectionMap[g.id] = g.section_id;
  });

  const sectionToPaperMap: Record<string, string> = {};
  (allSections || []).forEach((s) => {
    sectionToPaperMap[s.id] = s.paper_set_id;
  });

  (allQuestions || []).forEach((q) => {
    let secId = q.section_id;
    if (!secId && q.group_id) {
      secId = groupToSectionMap[q.group_id];
    }
    if (secId && sectionToPaperMap[secId]) {
      const pId = sectionToPaperMap[secId];
      questionCounts[pId] = (questionCounts[pId] || 0) + 1;
    }
  });

  const formattedPapers: PaperSetSummary[] = (rawPapers || []).map((p) => {
    const subj = Array.isArray(p.subjects) ? p.subjects[0] : p.subjects;
    const aType = Array.isArray(p.assessment_types) ? p.assessment_types[0] : p.assessment_types;

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      created_at: p.created_at,
      updated_at: p.updated_at,
      subject_id: p.subject_id,
      assessment_type_id: p.assessment_type_id,
      subjects: subj as unknown as { id: string; name: string; code: string },
      assessment_types: aType as unknown as { id: string; name: string },
      section_count: sectionCounts[p.id] || 0,
      question_count: questionCounts[p.id] || 0,
    };
  });

  return (
    <PaperLibraryClient
      paperSets={formattedPapers}
      subjects={subjects || []}
      assessmentTypes={assessmentTypes || []}
    />
  );
}
