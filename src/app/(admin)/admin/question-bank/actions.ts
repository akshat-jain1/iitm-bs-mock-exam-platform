"use server";

import { validateImageAssets, imageAssets } from "@/lib/question-images";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import { invalidatePaperStructureCache } from "@/lib/exam/paper-cache";

// ------------------------------------------------------------------------------
// PAPER SET TEMPLATE ACTIONS
// ------------------------------------------------------------------------------

export async function createPaperTemplateAction(formData: {
  subject_id: string;
  assessment_type_id: string;
  title: string;
  reference_material?: unknown;
}) {
  const { supabase } = await verifyAdmin();

  const { subject_id, assessment_type_id, title, reference_material } = formData;

  if (!subject_id || !assessment_type_id || !title.trim()) {
    return { success: false, error: "Subject, Assessment Type, and Title are required." };
  }

  // 1. Create Paper Set Template
  const { data: paper, error } = await supabase
    .from("paper_set_templates")
    .insert({
      subject_id,
      assessment_type_id,
      title: title.trim(),
      status: "Draft",
      reference_material: reference_material || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "A Paper Set with this title already exists for this Subject and Assessment Type." };
    }
    return { success: false, error: error.message };
  }

  // 2. Create default initial Section 1
  const { error: secError } = await supabase
    .from("section_templates")
    .insert({
      paper_set_id: paper.id,
      title: "Section 1",
    });

  if (secError) {
    console.error("Error creating initial section:", secError);
  }

  revalidatePath("/admin/question-bank");
  return { success: true, paperId: paper.id };
}

export async function updatePaperTemplateAction(payload: {
  id: string;
  title: string;
  reference_material?: unknown;
}) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("paper_set_templates")
    .update({
      title: payload.title.trim(),
      reference_material: payload.reference_material ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.id}`);
  revalidatePath("/admin/question-bank");
  return { success: true };
}

export async function deletePaperTemplateAction(id: string) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("paper_set_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/question-bank");
  return { success: true };
}

// ------------------------------------------------------------------------------
// SECTION ACTIONS
// ------------------------------------------------------------------------------

export async function createSectionAction(payload: {
  paper_set_id: string;
  title: string;
  reference_material?: unknown;
}) {
  const { supabase } = await verifyAdmin();

  const { data: section, error } = await supabase
    .from("section_templates")
    .insert({
      paper_set_id: payload.paper_set_id,
      title: payload.title.trim() || "New Section",
      reference_material: payload.reference_material || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true, section };
}

export async function updateSectionAction(payload: {
  id: string;
  paper_set_id: string;
  title: string;
  reference_material?: unknown;
}) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("section_templates")
    .update({
      title: payload.title.trim(),
      reference_material: payload.reference_material ?? null,
    })
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true };
}

export async function deleteSectionAction(payload: { id: string; paper_set_id: string }) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("section_templates")
    .delete()
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true };
}

// ------------------------------------------------------------------------------
// QUESTION GROUP ACTIONS
// ------------------------------------------------------------------------------

export async function createGroupAction(payload: {
  section_id: string;
  paper_set_id: string;
  title?: string;
  passage?: string;
  code_content?: { language: string; content: string } | null;
  reference_material?: unknown;
}) {
  const { supabase } = await verifyAdmin();

  // Find max sequence in this section
  const { data: nodes } = await supabase
    .from("section_content_nodes")
    .select("sequence")
    .eq("section_id", payload.section_id)
    .order("sequence", { ascending: false })
    .limit(1);

  const nextSeq = (nodes?.[0]?.sequence ?? 0) + 1;

  const { data: group, error: grpError } = await supabase
    .from("group_templates")
    .insert({
      section_id: payload.section_id,
      title: payload.title?.trim() || "Question Group",
      passage: payload.passage || "",
      code_content: payload.code_content || null,
      reference_material: payload.reference_material || null,
    })
    .select()
    .single();

  if (grpError) {
    return { success: false, error: grpError.message };
  }

  // Create section content node for the group
  const { error: nodeError } = await supabase
    .from("section_content_nodes")
    .insert({
      section_id: payload.section_id,
      node_type: "GROUP",
      group_id: group.id,
      sequence: nextSeq,
    });

  if (nodeError) {
    return { success: false, error: nodeError.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true, group };
}

export async function deleteGroupAction(payload: { id: string; paper_set_id: string }) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("group_templates")
    .delete()
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true };
}

// ------------------------------------------------------------------------------
// UNIFIED QUESTION SAVE ACTION
// ------------------------------------------------------------------------------

export interface QuestionSavePayload {
  id?: string;
  paper_set_id: string;
  section_id?: string | null;
  group_id?: string | null;
  type: "MCQ" | "MSQ" | "NUMERICAL";
  text: string;
  marks: number;
  verification_status?:
    | "Ready"
    | "Needs Review"
    | "Missing Image"
    | "Code Needs Review"
    | "Answer Needs Review"
    | "Extraction Warning";
  code_content?: { language: string; content: string } | null;
  image_assets?: unknown;
  options?: Array<{
    id?: string;
    text: string;
    sequence: number;
    is_correct: boolean;
    image_assets?: unknown | null;
  }>;
  eval_numeric?: {
    mode: "EXACT" | "RANGE";
    exact_val?: number | null;
    min_val?: number | null;
    max_val?: number | null;
  } | null;
}

export async function saveQuestionAction(payload: QuestionSavePayload) {
  const { supabase } = await verifyAdmin();

  const {
    id,
    paper_set_id,
    section_id,
    group_id,
    type,
    text,
    marks,
    verification_status,
    code_content,
    image_assets,
    options = [],
    eval_numeric,
  } = payload;

  for (const assets of [image_assets, ...options.map((option) => option.image_assets)]) {
    const error = validateImageAssets(assets);
    if (error) return { success: false, error };
  }
  if (type !== "NUMERICAL" && options.some((option) => !option.text.trim() && imageAssets(option.image_assets).length === 0)) {
    return { success: false, error: "Each option must have text or an image." };
  }

  // Validation
  if (!text.trim() && imageAssets(image_assets).length === 0) {
    return { success: false, error: "Add text or an image to the question." };
  }

  if (marks <= 0 || isNaN(marks)) {
    return { success: false, error: "Marks must be greater than 0." };
  }

  if (!section_id && !group_id) {
    return { success: false, error: "Question must belong to a section or a group." };
  }

  // Type-specific validation
  if (type === "MCQ") {
    if (options.length < 2) {
      return { success: false, error: "MCQ requires at least 2 options." };
    }
    const correctCount = options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      return { success: false, error: "MCQ must have exactly 1 correct option selected." };
    }
  } else if (type === "MSQ") {
    if (options.length < 2) {
      return { success: false, error: "MSQ requires at least 2 options." };
    }
    const correctCount = options.filter((o) => o.is_correct).length;
    if (correctCount === 0) {
      return { success: false, error: "MSQ must have at least 1 correct option selected." };
    }
  } else if (type === "NUMERICAL") {
    if (!eval_numeric) {
      return { success: false, error: "Numerical evaluation configuration is required." };
    }
    if (eval_numeric.mode === "EXACT") {
      if (eval_numeric.exact_val === undefined || eval_numeric.exact_val === null || isNaN(eval_numeric.exact_val)) {
        return { success: false, error: "Exact value is required for EXACT mode." };
      }
    } else if (eval_numeric.mode === "RANGE") {
      if (
        eval_numeric.min_val === undefined ||
        eval_numeric.min_val === null ||
        eval_numeric.max_val === undefined ||
        eval_numeric.max_val === null ||
        isNaN(eval_numeric.min_val) ||
        isNaN(eval_numeric.max_val)
      ) {
        return { success: false, error: "Min and Max values are required for RANGE mode." };
      }
      if (eval_numeric.min_val > eval_numeric.max_val) {
        return { success: false, error: "Range Min value cannot be greater than Max value." };
      }
    }
  }

  // Determine whether this is a metadata-only update for an existing question
  if (id) {
    const { data: existingQ, error: fetchQError } = await supabase
      .from("question_templates")
      .select("id, type")
      .eq("id", id)
      .single();

    if (fetchQError || !existingQ) {
      return { success: false, error: fetchQError?.message || "Question not found." };
    }

    let optionsOrAnswersChanged = false;

    if (existingQ.type !== type) {
      optionsOrAnswersChanged = true;
    } else if (type === "MCQ" || type === "MSQ") {
      const { data: existingOptions } = await supabase
        .from("option_templates")
        .select("id, text, sequence, image_assets")
        .eq("question_id", id)
        .order("sequence", { ascending: true });

      const { data: existingEvals } = await supabase
        .from("eval_mcq_msq_templates")
        .select("correct_option_id")
        .eq("question_id", id);

      const currentOpts = existingOptions || [];
      const currentEvals = new Set((existingEvals || []).map((e) => e.correct_option_id));
      const incomingOpts = (options || []).map((opt, idx) => ({
        id: opt.id,
        text: opt.text.trim(),
        sequence: idx + 1,
        is_correct: Boolean(opt.is_correct),
        image_assets: opt.image_assets ?? null,
      }));

      if (currentOpts.length !== incomingOpts.length) {
        optionsOrAnswersChanged = true;
      } else {
        for (let i = 0; i < incomingOpts.length; i++) {
          const cur = currentOpts[i];
          const inc = incomingOpts[i];
          const curIsCorrect = currentEvals.has(cur.id);
          const incIsCorrect = inc.is_correct;

          if (
            inc.id !== cur.id ||
            inc.text !== cur.text ||
            inc.sequence !== cur.sequence ||
            JSON.stringify(inc.image_assets) !== JSON.stringify(cur.image_assets ?? null) ||
            incIsCorrect !== curIsCorrect
          ) {
            optionsOrAnswersChanged = true;
            break;
          }
        }
      }
    } else if (type === "NUMERICAL") {
      const { data: existingNumEval } = await supabase
        .from("eval_numeric_templates")
        .select("mode, exact_val, min_val, max_val")
        .eq("question_id", id)
        .maybeSingle();

      if (!existingNumEval) {
        optionsOrAnswersChanged = true;
      } else {
        const modeChanged = existingNumEval.mode !== eval_numeric?.mode;
        const exactChanged = Number(existingNumEval.exact_val) !== Number(eval_numeric?.exact_val);
        const minChanged = Number(existingNumEval.min_val) !== Number(eval_numeric?.min_val);
        const maxChanged = Number(existingNumEval.max_val) !== Number(eval_numeric?.max_val);
        if (
          modeChanged ||
          (eval_numeric?.mode === "EXACT" && exactChanged) ||
          (eval_numeric?.mode === "RANGE" && (minChanged || maxChanged))
        ) {
          optionsOrAnswersChanged = true;
        }
      }
    }

    // 1. Metadata-only update: use existing single-statement update on question_templates
    if (!optionsOrAnswersChanged) {
      const { error: updateError } = await supabase
        .from("question_templates")
        .update({
          type,
          text: text.trim(),
          marks,
          verification_status: verification_status || "Ready",
          code_content: code_content || null,
          image_assets: image_assets || null,
        })
        .eq("id", id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      revalidatePath(`/admin/question-bank/papers/${paper_set_id}`);
      return { success: true, questionId: id };
    }
  }

  // 2. Any save that changes options, option ordering, correct-answer mappings, or creates a new question:
  // MUST use the atomic database RPC. If unavailable, return a clear error BEFORE performing any writes.
  const { data: rpcData, error: rpcError } = await supabase.rpc("save_question_template", {
    p_payload: payload,
  });

  if (rpcError || !rpcData?.success) {
    return {
      success: false,
      error:
        rpcError?.message ||
        "Atomic question save RPC is required when modifying options, answer mappings, or creating questions. Please ensure database migrations are applied.",
    };
  }

  revalidatePath(`/admin/question-bank/papers/${paper_set_id}`);
  return { success: true, questionId: rpcData.id };
}

export async function deleteQuestionAction(payload: { id: string; paper_set_id: string }) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("question_templates")
    .delete()
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true };
}

// ------------------------------------------------------------------------------
// VALIDATION & PUBLISHING ACTIONS
// ------------------------------------------------------------------------------

export async function validatePaperAction(paper_set_id: string) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase.rpc("validate_paper_for_publishing", {
    p_paper_set_id: paper_set_id,
  });

  if (error) {
    return { valid: false, error: error.message };
  }

  return { valid: true };
}

export async function publishPaperAction(paper_set_id: string) {
  const { supabase } = await verifyAdmin();

  // Call the atomic publish RPC
  const { data: versionId, error } = await supabase.rpc("publish_paper_set_template", {
    p_paper_set_id: paper_set_id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Invalidate any existing cached structure for this version and tags
  invalidatePaperStructureCache(versionId);

  revalidatePath(`/admin/question-bank/papers/${paper_set_id}`);
  revalidatePath("/admin/question-bank");
  return { success: true, versionId };
}

export async function updateQuestionVerificationStatusAction(payload: {
  id: string;
  paper_set_id: string;
  verification_status:
    | "Ready"
    | "Needs Review"
    | "Missing Image"
    | "Code Needs Review"
    | "Answer Needs Review"
    | "Extraction Warning";
}) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("question_templates")
    .update({ verification_status: payload.verification_status })
    .eq("id", payload.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/question-bank/papers/${payload.paper_set_id}`);
  return { success: true };
}
