"use server";

import { createClient } from "@/lib/supabase/server";

export interface StudentResourceItem {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  resource_type: "youtube" | "pdf" | "website" | "formula_sheet" | "notes" | "other";
  url: string;
  storage_path: string | null;
  topic: string;
  created_at: string;
  subjects: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface StudentSubjectItem {
  id: string;
  code: string;
  name: string;
}

export async function getStudentSubjectsAction(): Promise<StudentSubjectItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("Error fetching subjects for student resources:", error);
    return [];
  }

  return data;
}

export async function getStudentResourcesAction(subjectId?: string): Promise<StudentResourceItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("resources")
    .select(`
      id,
      subject_id,
      title,
      description,
      resource_type,
      url,
      storage_path,
      topic,
      created_at,
      subjects!inner ( id, code, name )
    `)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (subjectId && subjectId !== "all") {
    query = query.eq("subject_id", subjectId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("Error fetching student resources:", error);
    return [];
  }

  interface ResourceJoin {
    id: string;
    subject_id: string;
    title: string;
    description: string;
    resource_type: StudentResourceItem["resource_type"];
    url: string;
    storage_path: string | null;
    topic: string;
    created_at: string;
    subjects: { id: string; code: string; name: string } | { id: string; code: string; name: string }[];
  }

  return ((data as unknown as ResourceJoin[]) || []).map((r) => {
    const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
    return {
      id: r.id,
      subject_id: r.subject_id,
      title: r.title,
      description: r.description || "",
      resource_type: r.resource_type,
      url: r.url || "",
      storage_path: r.storage_path,
      topic: r.topic || "",
      created_at: r.created_at,
      subjects: s ? { id: s.id, code: s.code, name: s.name } : null,
    };
  });
}
