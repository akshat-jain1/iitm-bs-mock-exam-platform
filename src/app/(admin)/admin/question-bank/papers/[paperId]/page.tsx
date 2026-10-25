import React from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaperAuthoringWorkspace } from "./PaperAuthoringWorkspace";

interface PageProps {
  params: Promise<{ paperId: string }>;
}

export default async function PaperAuthoringPage({ params }: PageProps) {
  const resolvedParams = await params;
  const supabase = await createClient();

  // 1. Fetch Paper Set Template
  const { data: paper, error: paperError } = await supabase
    .from("paper_set_templates")
    .select(`
      id,
      title,
      status,
      subject_id,
      assessment_type_id,
      reference_material,
      subjects!inner ( id, name, code ),
      assessment_types!inner ( id, name )
    `)
    .eq("id", resolvedParams.paperId)
    .single();

  if (paperError || !paper) {
    notFound();
  }

  // 2. Fetch Sections
  const { data: rawSections } = await supabase
    .from("section_templates")
    .select("id, paper_set_id, title, reference_material")
    .eq("paper_set_id", resolvedParams.paperId)
    .order("id", { ascending: true });

  const sectionsList = rawSections || [];
  const sectionIds = sectionsList.map((s) => s.id);

  // 3. Fetch Groups
  let groupsList: Array<{
    id: string;
    section_id: string;
    title: string | null;
    passage: string | null;
    code_content: { language: string; content: string } | null;
    image_assets: unknown;
  }> = [];

  if (sectionIds.length > 0) {
    const { data: rawGroups } = await supabase
      .from("group_templates")
      .select("id, section_id, title, passage, code_content, image_assets")
      .in("section_id", sectionIds);
    groupsList = (rawGroups || []) as unknown as typeof groupsList;
  }

  const groupIds = groupsList.map((g) => g.id);

  // 4. Fetch Questions
  type RawQuestion = {
    id: string;
    section_id: string | null;
    group_id: string | null;
    type: "MCQ" | "MSQ" | "NUMERICAL";
    text: string;
    marks: number;
    verification_status:
      | "Ready"
      | "Needs Review"
      | "Missing Image"
      | "Code Needs Review"
      | "Answer Needs Review"
      | "Extraction Warning";
    code_content: { language: string; content: string } | null;
    image_assets: unknown;
    source: string | null;
  };

  let rawQuestions: RawQuestion[] = [];

  if (sectionIds.length > 0) {
    let query = supabase
      .from("question_templates")
      .select("id, section_id, group_id, type, text, marks, code_content, image_assets, verification_status, source");

    if (groupIds.length > 0) {
      query = query.or(`section_id.in.(${sectionIds.join(",")}),group_id.in.(${groupIds.join(",")})`);
    } else {
      query = query.in("section_id", sectionIds);
    }

    const { data: qData } = await query;
    rawQuestions = (qData || []) as unknown as RawQuestion[];
  }

  const questionIds = rawQuestions.map((q) => q.id);

  // 5. Fetch Options
  type RawOption = {
    id: string;
    question_id: string;
    text: string;
    sequence: number;
    image_assets?: unknown | null;
  };
  let rawOptions: RawOption[] = [];
  if (questionIds.length > 0) {
    const { data: optData } = await supabase
      .from("option_templates")
      .select("id, question_id, text, sequence, image_assets")
      .in("question_id", questionIds)
      .order("sequence", { ascending: true });
    rawOptions = (optData || []) as unknown as RawOption[];
  }

  // 6. Fetch Evaluation (MCQ/MSQ)
  type RawEvalMcq = {
    question_id: string;
    correct_option_id: string;
  };
  let rawEvalMcq: RawEvalMcq[] = [];
  if (questionIds.length > 0) {
    const { data: evalMcqData } = await supabase
      .from("eval_mcq_msq_templates")
      .select("question_id, correct_option_id")
      .in("question_id", questionIds);
    rawEvalMcq = (evalMcqData || []) as unknown as RawEvalMcq[];
  }

  // 7. Fetch Evaluation (Numerical)
  type RawEvalNum = {
    question_id: string;
    mode: "EXACT" | "RANGE";
    exact_val: number | null;
    min_val: number | null;
    max_val: number | null;
  };
  let rawEvalNum: RawEvalNum[] = [];
  if (questionIds.length > 0) {
    const { data: evalNumData } = await supabase
      .from("eval_numeric_templates")
      .select("question_id, mode, exact_val, min_val, max_val")
      .in("question_id", questionIds);
    rawEvalNum = (evalNumData || []) as unknown as RawEvalNum[];
  }

  // 8. Fetch Section Content Nodes
  let rawContentNodes: Array<{
    id: string;
    section_id: string;
    node_type: "QUESTION" | "GROUP";
    question_id: string | null;
    group_id: string | null;
    sequence: number;
  }> = [];

  if (sectionIds.length > 0) {
    const { data: nodesData } = await supabase
      .from("section_content_nodes")
      .select("id, section_id, node_type, question_id, group_id, sequence")
      .in("section_id", sectionIds)
      .order("sequence", { ascending: true });
    rawContentNodes = (nodesData || []) as typeof rawContentNodes;
  }

  // 9. Fetch Published Versions
  const { data: publishedVersions } = await supabase
    .from("paper_set_versions")
    .select("id, title, created_at")
    .eq("cloned_from_id", resolvedParams.paperId)
    .order("created_at", { ascending: false });

  // Map everything into hierarchical SectionData structure
  const formattedSections = sectionsList.map((sec) => {
    // Direct questions in this section
    const directQuestions = rawQuestions
      .filter((q) => q.section_id === sec.id)
      .map((q) => ({
        ...q,
        options: rawOptions.filter((o) => o.question_id === q.id),
        eval_mcq: rawEvalMcq.filter((e) => e.question_id === q.id),
        eval_numeric: rawEvalNum.find((en) => en.question_id === q.id) || null,
      }));

    // Groups in this section
    const groups = groupsList
      .filter((g) => g.section_id === sec.id)
      .map((g) => ({
        ...g,
        reference_material: null,
        questions: rawQuestions
          .filter((q) => q.group_id === g.id)
          .map((q) => ({
            ...q,
            options: rawOptions.filter((o) => o.question_id === q.id),
            eval_mcq: rawEvalMcq.filter((e) => e.question_id === q.id),
            eval_numeric: rawEvalNum.find((en) => en.question_id === q.id) || null,
          })),
      }));

    return {
      id: sec.id,
      paper_set_id: sec.paper_set_id,
      title: sec.title,
      reference_material: sec.reference_material,
      questions: directQuestions,
      groups,
      content_nodes: rawContentNodes.filter((cn) => cn.section_id === sec.id),
    };
  });

  const paperProps = {
    id: paper.id,
    title: paper.title,
    status: paper.status,
    subject_id: paper.subject_id,
    assessment_type_id: paper.assessment_type_id,
    reference_material: paper.reference_material,
    subjects: Array.isArray(paper.subjects) ? paper.subjects[0] : paper.subjects,
    assessment_types: Array.isArray(paper.assessment_types)
      ? paper.assessment_types[0]
      : paper.assessment_types,
  };

  return (
    <PaperAuthoringWorkspace
      paper={paperProps}
      sections={formattedSections}
      publishedVersions={publishedVersions || []}
    />
  );
}
