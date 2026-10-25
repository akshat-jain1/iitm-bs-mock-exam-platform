import React from "react";
import { createClient } from "@/lib/supabase/server";
import { PaperImportClient } from "./PaperImportClient";

interface PageProps {
  searchParams: Promise<{ paperId?: string }>;
}

export default async function PaperImportPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const supabase = await createClient();

  // 1. Fetch Subjects
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, code")
    .order("code", { ascending: true });

  // 2. Fetch Assessment Types
  const { data: assessmentTypes } = await supabase
    .from("assessment_types")
    .select("id, name")
    .order("name", { ascending: true });

  // 3. Fetch Existing Draft Paper Sets
  const { data: paperSets } = await supabase
    .from("paper_set_templates")
    .select(`
      id,
      title,
      status,
      subject_id,
      assessment_type_id,
      subjects!inner ( id, name, code ),
      assessment_types!inner ( id, name )
    `)
    .order("created_at", { ascending: false });

  // 4. Fetch Recent Import Jobs
  const { data: recentJobs } = await supabase
    .from("paper_import_jobs")
    .select(`
      id,
      paper_set_id,
      source_filename,
      file_size_bytes,
      status,
      extraction_metadata,
      error_message,
      created_at,
      paper_set_templates!inner ( id, title )
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  const formattedPaperSets = (paperSets || []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    subject_id: p.subject_id,
    assessment_type_id: p.assessment_type_id,
    subjects: Array.isArray(p.subjects) ? p.subjects[0] : p.subjects,
    assessment_types: Array.isArray(p.assessment_types) ? p.assessment_types[0] : p.assessment_types,
  }));

  const formattedJobs = (recentJobs || []).map((j) => ({
    id: j.id,
    paper_set_id: j.paper_set_id,
    source_filename: j.source_filename,
    file_size_bytes: j.file_size_bytes,
    status: j.status,
    extraction_metadata: j.extraction_metadata,
    error_message: j.error_message,
    created_at: j.created_at,
    paper_title: (Array.isArray(j.paper_set_templates) ? j.paper_set_templates[0] : j.paper_set_templates)?.title || "Untitled Paper",
  }));

  return (
    <PaperImportClient
      subjects={subjects || []}
      assessmentTypes={assessmentTypes || []}
      paperSets={formattedPaperSets}
      recentJobs={formattedJobs}
      initialPaperId={resolvedParams.paperId}
    />
  );
}
