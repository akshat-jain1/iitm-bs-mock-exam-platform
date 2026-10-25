"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/auth/cached-auth";
import {
  extractRawTextFromPdf,
  parsePaperStructure,
  ExtractedPdfImage,
  ExtractedQuestion,
  ExtractedGroup,
} from "@/lib/pdf/extractor";
import { matchesSubject } from "@/lib/pdf/subjectMatcher";
import { randomUUID } from "crypto";

interface ImageAssetMetadata {
  id: string;
  storage_path: string;
  width: number;
  height: number;
  mime_type: string;
  page_number: number;
}

async function uploadImagesForEntity(
  supabaseClient: Awaited<ReturnType<typeof createClient>>,
  paperSetId: string,
  prefix: string,
  images?: ExtractedPdfImage[]
): Promise<{ assets: ImageAssetMetadata[] | null; hasUploadFailure: boolean }> {
  if (!images || images.length === 0) {
    return { assets: null, hasUploadFailure: false };
  }

  const uploadedAssets: ImageAssetMetadata[] = [];
  let hasUploadFailure = false;

  const seenObjIds = new Set<number>();
  const uniqueImages = images.filter((img) => {
    if (seenObjIds.has(img.object_id)) return false;
    seenObjIds.add(img.object_id);
    return true;
  });

  for (const img of uniqueImages) {
    const filename = `${prefix}_${img.object_id}.jpg`;
    const storagePath = `papers/${paperSetId}/${filename}`;

    try {
      const { error: uploadError } = await supabaseClient.storage
        .from("question_assets")
        .upload(storagePath, img.image_bytes, {
          contentType: img.mime_type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Failed to upload question asset ${storagePath}:`, uploadError);
        hasUploadFailure = true;
      } else {
        uploadedAssets.push({
          id: randomUUID(),
          storage_path: storagePath,
          width: img.width,
          height: img.height,
          mime_type: img.mime_type || "image/jpeg",
          page_number: img.page_number,
        });
      }
    } catch (err) {
      console.error(`Exception uploading question asset ${storagePath}:`, err);
      hasUploadFailure = true;
    }
  }

  return {
    assets: uploadedAssets.length > 0 ? uploadedAssets : null,
    hasUploadFailure,
  };
}

async function persistQuestionWithSubordinates({
  supabaseClient,
  paperSetId,
  sectionId,
  groupId,
  q,
  nodeSequence,
  labelPrefix,
}: {
  supabaseClient: Awaited<ReturnType<typeof createClient>>;
  paperSetId: string;
  sectionId?: string;
  groupId?: string;
  q: ExtractedQuestion;
  nodeSequence?: number;
  labelPrefix: string;
}): Promise<{ questionId: string; needsReview: boolean }> {
  const { assets: qAssets, hasUploadFailure: qUploadFailure } =
    await uploadImagesForEntity(supabaseClient, paperSetId, labelPrefix, q.images);

  if (qUploadFailure) {
    q.verification_status = "Missing Image";
  }

  const imageAssets = qAssets || q.image_assets || null;
  const sourceVal = q.question_number
    ? `PDF Import (Q${q.question_number})`
    : "PDF Import";

  const questionPayload: Record<string, unknown> = {
    type: q.type,
    text: q.text,
    marks: q.marks,
    verification_status: q.verification_status,
    code_content: q.code_content || null,
    image_assets: imageAssets,
    source: sourceVal,
  };

  if (sectionId) {
    questionPayload.section_id = sectionId;
  } else if (groupId) {
    questionPayload.group_id = groupId;
  }

  const { data: dbQ, error: qErr } = await supabaseClient
    .from("question_templates")
    .insert(questionPayload)
    .select()
    .single();

  if (qErr || !dbQ) {
    throw new Error(
      `Failed to insert question (${sourceVal}): ${qErr?.message || "Unknown database error"}`
    );
  }

  if (sectionId && nodeSequence !== undefined) {
    const { error: nodeErr } = await supabaseClient.from("section_content_nodes").insert({
      section_id: sectionId,
      node_type: "QUESTION",
      question_id: dbQ.id,
      sequence: nodeSequence,
    });
    if (nodeErr) {
      throw new Error(
        `Failed to insert section content node for question (${sourceVal}): ${nodeErr.message}`
      );
    }
  }

  if (q.type === "MCQ" || q.type === "MSQ") {
    const insertedOptions: Array<{ id: string; is_correct: boolean }> = [];
    for (const opt of q.options) {
      let optAssets = null;
      if (opt.images && opt.images.length > 0) {
        const { assets } = await uploadImagesForEntity(
          supabaseClient,
          paperSetId,
          `opt_${labelPrefix}_seq${opt.sequence}`,
          opt.images
        );
        optAssets = assets;
      }
      const optImageAssets = optAssets || opt.image_assets || null;

      const { data: dbOpt, error: optErr } = await supabaseClient
        .from("option_templates")
        .insert({
          question_id: dbQ.id,
          text: opt.text,
          sequence: opt.sequence,
          image_assets: optImageAssets,
        })
        .select()
        .single();

      if (optErr || !dbOpt) {
        throw new Error(
          `Failed to insert option (sequence ${opt.sequence}) for question (${sourceVal}): ${optErr?.message || "Unknown database error"}`
        );
      }
      insertedOptions.push({ id: dbOpt.id, is_correct: opt.is_correct });
    }

    const correctOpts = insertedOptions.filter((o) => o.is_correct);
    for (const co of correctOpts) {
      const { error: evalErr } = await supabaseClient.from("eval_mcq_msq_templates").insert({
        question_id: dbQ.id,
        correct_option_id: co.id,
      });
      if (evalErr) {
        throw new Error(
          `Failed to insert evaluation mapping for question (${sourceVal}): ${evalErr.message}`
        );
      }
    }
  } else if (q.type === "NUMERICAL" && q.eval_numeric) {
    const { error: numEvalErr } = await supabaseClient.from("eval_numeric_templates").insert({
      question_id: dbQ.id,
      mode: q.eval_numeric.mode,
      exact_val: q.eval_numeric.exact_val ?? null,
      min_val: q.eval_numeric.min_val ?? null,
      max_val: q.eval_numeric.max_val ?? null,
    });
    if (numEvalErr) {
      throw new Error(
        `Failed to insert numerical evaluation for question (${sourceVal}): ${numEvalErr.message}`
      );
    }
  }

  return { questionId: dbQ.id, needsReview: q.verification_status !== "Ready" };
}

async function persistGroupWithSubordinates({
  supabaseClient,
  paperSetId,
  sectionId,
  grp,
  nodeSequence,
  labelPrefix,
  destinationSubject,
}: {
  supabaseClient: Awaited<ReturnType<typeof createClient>>;
  paperSetId: string;
  sectionId: string;
  grp: ExtractedGroup;
  nodeSequence: number;
  labelPrefix: string;
  destinationSubject: { id: string; name: string; code: string };
}): Promise<{ savedQuestions: number; needsReviewCount: number }> {
  const { assets: grpAssets, hasUploadFailure: grpUploadFailure } =
    await uploadImagesForEntity(supabaseClient, paperSetId, labelPrefix, grp.images);

  const groupImageAssets = grpAssets || grp.image_assets || null;

  const { data: dbGrp, error: grpErr } = await supabaseClient
    .from("group_templates")
    .insert({
      section_id: sectionId,
      title: grp.title,
      passage: grp.passage,
      code_content: grp.code_content || null,
      image_assets: groupImageAssets,
    })
    .select()
    .single();

  if (grpErr || !dbGrp) {
    throw new Error(
      `Failed to insert group '${grp.title || "Untitled"}': ${grpErr?.message || "Unknown database error"}`
    );
  }

  const { error: grpNodeErr } = await supabaseClient.from("section_content_nodes").insert({
    section_id: sectionId,
    node_type: "GROUP",
    group_id: dbGrp.id,
    sequence: nodeSequence,
  });

  if (grpNodeErr) {
    throw new Error(
      `Failed to insert content node for group '${grp.title}': ${grpNodeErr.message}`
    );
  }

  let savedQuestions = 0;
  let needsReviewCount = 0;

  for (let gqIdx = 0; gqIdx < grp.questions.length; gqIdx++) {
    const gq = grp.questions[gqIdx];
    if (gq.is_confirmation || gq.is_useful_data || !gq.marks || gq.marks <= 0) {
      continue;
    }

    const gqSubject = gq.source_subject || grp.source_subject || "";
    if (gqSubject && !matchesSubject(gqSubject, destinationSubject)) {
      continue;
    }

    if (grpUploadFailure) {
      gq.verification_status = "Missing Image";
    }

    const gqLabel = gq.question_number
      ? `q_${gq.question_number}`
      : `${labelPrefix}_q${gqIdx + 1}`;

    const { needsReview } = await persistQuestionWithSubordinates({
      supabaseClient,
      paperSetId,
      groupId: dbGrp.id,
      q: gq,
      labelPrefix: gqLabel,
    });

    savedQuestions++;
    if (needsReview) needsReviewCount++;
  }

  return { savedQuestions, needsReviewCount };
}

export type ImportPaperResult =
  | {
      success: true;
      paperSetId: string;
      jobId: string;
      summary: {
        total_questions: number;
        sections_created: number;
        needs_review_count: number;
      };
    }
  | {
      success: false;
      error: string;
      detectedSubjects?: string[];
    };

export async function importPaperFromPdfAction(formData: FormData): Promise<ImportPaperResult> {
  let supabaseClient;
  let adminUser;
  try {
    const { supabase, user } = await verifyAdmin();
    supabaseClient = supabase;
    adminUser = user;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const file = formData.get("file") as File | null;
  let paperSetId = formData.get("paper_set_id") as string | null;
  const subjectId = formData.get("subject_id") as string | null;
  const assessmentTypeId = formData.get("assessment_type_id") as string | null;
  const paperTitle = formData.get("title") as string | null;

  if (!file) {
    return { success: false, error: "Please upload a PDF file." };
  }

  if (file.size === 0) {
    return { success: false, error: "The uploaded file is empty. Please upload a valid PDF document." };
  }

  const filename = file.name || "paper.pdf";
  if (!filename.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return { success: false, error: "Invalid file type. Only PDF files are supported." };
  }

  const maxBytes = 20 * 1024 * 1024; // 20MB
  if (file.size > maxBytes) {
    return { success: false, error: "File exceeds 20MB size limit." };
  }

  if (file.size < 5) {
    return { success: false, error: "Malformed PDF file: file is too small to be a valid PDF." };
  }

  // Preflight check: read header bytes before reading entire 20MB buffer into memory
  const headerSlice = await file.slice(0, 5).arrayBuffer();
  const headerBuf = Buffer.from(headerSlice);
  if (!headerBuf.toString("ascii").startsWith("%PDF")) {
    return { success: false, error: "Malformed PDF file: missing PDF header signature (%PDF)." };
  }

  // 1. Resolve Target Subject
  let destinationSubject: { id: string; name: string; code: string } | null = null;
  if (paperSetId) {
    const { data: targetPaper, error: targetPaperError } = await supabaseClient
      .from("paper_set_templates")
      .select(`
        id,
        title,
        subject_id,
        subjects ( id, name, code )
      `)
      .eq("id", paperSetId)
      .single();

    if (targetPaperError || !targetPaper) {
      return { success: false, error: "Target Paper Set not found." };
    }

    destinationSubject = (
      Array.isArray(targetPaper.subjects) ? targetPaper.subjects[0] : targetPaper.subjects
    ) as { id: string; name: string; code: string } | null;

    if (!destinationSubject) {
      return { success: false, error: "Target Paper Set does not have an associated subject." };
    }
  } else {
    if (!subjectId || !assessmentTypeId || !paperTitle?.trim()) {
      return {
        success: false,
        error: "Subject, Assessment Type, and Title are required to create a new Paper Set.",
      };
    }

    const { data: subjData, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id, name, code")
      .eq("id", subjectId)
      .single();

    if (subjErr || !subjData) {
      return { success: false, error: "Selected Subject not found." };
    }

    destinationSubject = subjData as { id: string; name: string; code: string };
  }

  // 2. Create Paper Set Template if not selecting an existing one
  if (!paperSetId) {
    const { data: newPaper, error: paperError } = await supabaseClient
      .from("paper_set_templates")
      .insert({
        subject_id: subjectId,
        assessment_type_id: assessmentTypeId,
        title: paperTitle!.trim(),
        status: "Draft",
      })
      .select()
      .single();

    if (paperError) {
      if (paperError.code === "23505") {
        return {
          success: false,
          error: "A Paper Set with this title already exists for this Subject and Assessment Type.",
        };
      }
      return { success: false, error: paperError.message };
    }

    paperSetId = newPaper.id;
  }

  // 3. Read Buffer and Execute Core Import
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return await executePaperImportCore({
    supabaseClient,
    adminUserId: adminUser.id,
    buffer,
    filename,
    fileSize: file.size,
    paperSetId: paperSetId!,
    destinationSubject: destinationSubject!,
  });
}

interface RollbackOutcome {
  attempted: boolean;
  succeeded: boolean;
  cleanupError: string | null;
}

async function rollbackCreatedSections(
  supabaseClient: Awaited<ReturnType<typeof createClient>>,
  createdSectionIds: string[]
): Promise<RollbackOutcome> {
  if (createdSectionIds.length === 0) {
    return { attempted: false, succeeded: true, cleanupError: null };
  }

  try {
    const { error: deleteError } = await supabaseClient
      .from("section_templates")
      .delete()
      .in("id", createdSectionIds);

    if (deleteError) {
      console.error(
        `Failed to clean up partial sections (${createdSectionIds.length} tracked):`,
        deleteError.message
      );
      return {
        attempted: true,
        succeeded: false,
        cleanupError: deleteError.message,
      };
    }

    return { attempted: true, succeeded: true, cleanupError: null };
  } catch (thrown: unknown) {
    const msg = thrown instanceof Error ? thrown.message : "Unexpected exception during cleanup";
    console.error("Exception cleaning up partial sections:", msg);
    return {
      attempted: true,
      succeeded: false,
      cleanupError: msg,
    };
  }
}

interface JobFailureUpdateOutcome {
  succeeded: boolean;
  updateError: string | null;
}

async function updateJobFailureStatus(
  supabaseClient: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  errorMessage: string,
  metadata: Record<string, unknown>
): Promise<JobFailureUpdateOutcome> {
  try {
    const { data: updatedJob, error: updateError } = await supabaseClient
      .from("paper_import_jobs")
      .update({
        status: "Failed",
        error_message: errorMessage,
        extraction_metadata: metadata,
      })
      .eq("id", jobId)
      .select("id")
      .single();

    if (updateError) {
      console.error(
        `Failed to update import job ${jobId} status to Failed:`,
        updateError.message
      );
      return {
        succeeded: false,
        updateError: updateError.message,
      };
    }

    if (!updatedJob || updatedJob.id !== jobId) {
      const missingRowError = `Import job row with ID ${jobId} was not updated or not found`;
      console.error(missingRowError);
      return {
        succeeded: false,
        updateError: missingRowError,
      };
    }

    return { succeeded: true, updateError: null };
  } catch (thrown: unknown) {
    const msg = thrown instanceof Error ? thrown.message : "Unexpected exception during job status update";
    console.error(`Exception updating import job ${jobId} status to Failed:`, msg);
    return {
      succeeded: false,
      updateError: msg,
    };
  }
}

export async function executePaperImportCore({
  supabaseClient,
  adminUserId,
  buffer,
  filename,
  fileSize,
  paperSetId,
  destinationSubject,
}: {
  supabaseClient: Awaited<ReturnType<typeof createClient>>;
  adminUserId: string;
  buffer: Buffer;
  filename: string;
  fileSize: number;
  paperSetId: string;
  destinationSubject: { id: string; name: string; code: string };
}): Promise<ImportPaperResult> {
  const activePaperSetId = paperSetId;

  if (!buffer || buffer.length === 0) {
    return {
      success: false,
      error: "PDF buffer is empty.",
    };
  }

  if (buffer.length < 5 || !buffer.toString("ascii", 0, 5).startsWith("%PDF")) {
    return {
      success: false,
      error: "Malformed PDF: missing PDF header signature (%PDF).",
    };
  }

  const { rawText, hasImages, imagesMap } = extractRawTextFromPdf(buffer);
  const parsed = parsePaperStructure(rawText, hasImages, imagesMap);

  if (parsed.total_questions === 0) {
    return {
      success: false,
      error: "No structured questions could be extracted from this PDF. Please check document formatting or author questions manually.",
    };
  }

  // Subject Boundary Detection & Validation
  const matchingSections = parsed.sections.filter((sec) => {
    return (
      matchesSubject(sec.subject_name || sec.title, destinationSubject) ||
      matchesSubject(sec.source_subject || "", destinationSubject)
    );
  });

  const validMatchingQuestionsCount = matchingSections.reduce((acc, sec) => {
    const directQs = sec.questions.filter(
      (q) =>
        !q.is_confirmation &&
        !q.is_useful_data &&
        q.marks > 0 &&
        matchesSubject(q.source_subject || sec.subject_name || sec.title, destinationSubject)
    ).length;
    const groupQs = sec.groups.reduce((gAcc, grp) => {
      return (
        gAcc +
        grp.questions.filter(
          (gq) =>
            !gq.is_confirmation &&
            !gq.is_useful_data &&
            gq.marks > 0 &&
            matchesSubject(
              gq.source_subject || grp.source_subject || sec.subject_name || sec.title,
              destinationSubject
            )
        ).length
      );
    }, 0);
    return acc + directQs + groupQs;
  }, 0);

  if (matchingSections.length === 0 || validMatchingQuestionsCount === 0) {
    const detectedList =
      parsed.detected_subjects && parsed.detected_subjects.length > 0
        ? parsed.detected_subjects.join(", ")
        : "None detected";
    const subjectMismatchError = `The uploaded PDF does not contain a question section for ${destinationSubject.name} (${destinationSubject.code}). Detected subject(s) in document: ${detectedList}.`;

    if (paperSetId) {
      await supabaseClient.from("paper_import_jobs").insert({
        paper_set_id: paperSetId,
        source_filename: filename,
        file_size_bytes: fileSize,
        status: "Failed",
        error_message: subjectMismatchError,
        extraction_metadata: {
          total_questions: 0,
          detected_subjects: parsed.detected_subjects,
          target_subject: destinationSubject,
        },
        created_by: adminUserId,
      });
    }

    return {
      success: false,
      error: subjectMismatchError,
      detectedSubjects: parsed.detected_subjects,
    };
  }

  const { data: job, error: jobError } = await supabaseClient
    .from("paper_import_jobs")
    .insert({
      paper_set_id: paperSetId,
      source_filename: filename,
      file_size_bytes: fileSize,
      status: "Extracting",
      created_by: adminUserId,
    })
    .select()
    .single();

  if (jobError || !job) {
    return { success: false, error: jobError?.message || "Failed to initialize import job." };
  }

  const createdSectionIds: string[] = [];
  let totalNeedsReview = 0;
  let createdQuestionsCount = 0;
  let createdSectionsCount = 0;

  try {
    // Resilient storage upload for backup
    const storagePath = `${paperSetId}/${job.id}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const { error: uploadError } = await supabaseClient.storage.from("pdf_imports").upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (!uploadError) {
        await supabaseClient
          .from("paper_import_jobs")
          .update({ storage_path: storagePath })
          .eq("id", job.id);
      }
    } catch (storageErr) {
      console.warn("Storage upload notice (continuing parsing):", storageErr);
    }

    // Check if this is an append operation into an existing Paper Set
    const { count: existingSectionsCount } = await supabaseClient
      .from("section_templates")
      .select("id", { count: "exact", head: true })
      .eq("paper_set_id", paperSetId);

    const isAppending = (existingSectionsCount || 0) > 0;

    // Persist Extracted Sections, Groups, and Questions (Filtered to Target Subject)
    for (let sIdx = 0; sIdx < matchingSections.length; sIdx++) {
      const sec = matchingSections[sIdx];

      // Filter out any section that has no valid questions, groups, or reference material
      const hasValidStandalone = sec.questions.some(
        (q) => !q.is_confirmation && !q.is_useful_data && q.marks > 0
      );
      const hasValidGroups = sec.groups.some(
        (g) => g.questions.some((gq) => !gq.is_confirmation && !gq.is_useful_data && gq.marks > 0)
      );
      const hasValidItems = sec.items && sec.items.some((it) => {
        if (it.type === "QUESTION") return !it.question.is_confirmation && !it.question.is_useful_data && it.question.marks > 0;
        if (it.type === "GROUP") return it.group.questions.some((gq) => !gq.is_confirmation && !gq.is_useful_data && gq.marks > 0);
        return false;
      });
      const hasRefMaterial = Boolean(
        sec.reference_material ||
        (sec.reference_material_images && sec.reference_material_images.length > 0)
      );

      if (!hasValidStandalone && !hasValidGroups && !hasValidItems && !hasRefMaterial) {
        continue;
      }
      const baseTitle = sec.title || `Section ${sIdx + 1}`;
      const sectionTitle = isAppending && !baseTitle.includes("(Imported)")
        ? `${baseTitle} (Imported)`
        : baseTitle;

      let secRefMaterial = sec.reference_material || null;
      if (sec.reference_material_images && sec.reference_material_images.length > 0) {
        const { assets: refAssets } = await uploadImagesForEntity(
          supabaseClient,
          activePaperSetId,
          `ref_sec_${sIdx + 1}`,
          sec.reference_material_images
        );
        if (refAssets && refAssets.length > 0) {
          const existingTitle =
            typeof secRefMaterial === "object" && secRefMaterial !== null && "title" in secRefMaterial
              ? String((secRefMaterial as { title: string }).title)
              : "Useful Data / Reference Material";
          secRefMaterial = {
            title: existingTitle,
            sections: [
              {
                title: "Reference Data",
                items: refAssets.map((a: ImageAssetMetadata) => ({
                  type: "image",
                  url: `/api/assets/${a.storage_path}`,
                  alt: "Useful Data Reference",
                })),
              },
            ],
          };
        }
      }

      const { data: dbSec, error: secErr } = await supabaseClient
        .from("section_templates")
        .insert({
          paper_set_id: paperSetId,
          title: sectionTitle,
          reference_material: secRefMaterial,
        })
        .select()
        .single();

      if (secErr || !dbSec) {
        throw new Error(`Failed to create section '${sectionTitle}': ${secErr?.message || "Unknown database error"}`);
      }

      createdSectionIds.push(dbSec.id);
      createdSectionsCount++;
      let nodeSeq = 1;

      // If document items are provided in interleaved source order, preserve their sequence
      if (sec.items && sec.items.length > 0) {
        for (const item of sec.items) {
          if (item.type === "QUESTION") {
            const q = item.question;
            if (q.is_confirmation || q.is_useful_data || !q.marks || q.marks <= 0) {
              continue;
            }

            const qSubject = q.source_subject || sec.subject_name || sec.title;
            if (!matchesSubject(qSubject, destinationSubject)) {
              continue;
            }

            const qLabel = q.question_number ? `q_${q.question_number}` : `q_s${sIdx + 1}_n${nodeSeq}`;
            const { needsReview } = await persistQuestionWithSubordinates({
              supabaseClient,
              paperSetId: activePaperSetId,
              sectionId: dbSec.id,
              q,
              nodeSequence: nodeSeq++,
              labelPrefix: qLabel,
            });

            createdQuestionsCount++;
            if (needsReview) totalNeedsReview++;
          } else if (item.type === "GROUP") {
            const grp = item.group;
            const grpSubject = grp.source_subject || sec.subject_name || sec.title;
            const hasMatchingGroupQuestions = grp.questions.some(
              (gq) =>
                !gq.is_confirmation &&
                !gq.is_useful_data &&
                gq.marks > 0 &&
                matchesSubject(gq.source_subject || grpSubject, destinationSubject)
            );
            if (!hasMatchingGroupQuestions) {
              continue;
            }

            const grpLabel = `grp_s${sIdx + 1}_n${nodeSeq}`;
            const { savedQuestions, needsReviewCount } = await persistGroupWithSubordinates({
              supabaseClient,
              paperSetId: activePaperSetId,
              sectionId: dbSec.id,
              grp,
              nodeSequence: nodeSeq++,
              labelPrefix: grpLabel,
              destinationSubject,
            });

            createdQuestionsCount += savedQuestions;
            totalNeedsReview += needsReviewCount;
          }
        }
      } else {
        // Fallback: Insert Direct Questions first, then Groups
        for (const q of sec.questions) {
          if (q.is_confirmation || q.is_useful_data || !q.marks || q.marks <= 0) {
            continue;
          }

          const qSubject = q.source_subject || sec.subject_name || sec.title;
          if (!matchesSubject(qSubject, destinationSubject)) {
            continue;
          }

          const qLabel = q.question_number ? `q_${q.question_number}` : `q_s${sIdx + 1}_n${nodeSeq}`;
          const { needsReview } = await persistQuestionWithSubordinates({
            supabaseClient,
            paperSetId: activePaperSetId,
            sectionId: dbSec.id,
            q,
            nodeSequence: nodeSeq++,
            labelPrefix: qLabel,
          });

          createdQuestionsCount++;
          if (needsReview) totalNeedsReview++;
        }

        for (const grp of sec.groups) {
          const grpSubject = grp.source_subject || sec.subject_name || sec.title;
          const hasMatchingGroupQuestions = grp.questions.some(
            (gq) =>
              !gq.is_confirmation &&
              !gq.is_useful_data &&
              gq.marks > 0 &&
              matchesSubject(gq.source_subject || grpSubject, destinationSubject)
          );
          if (!hasMatchingGroupQuestions) {
            continue;
          }

          const grpLabel = `grp_s${sIdx + 1}_n${nodeSeq}`;
          const { savedQuestions, needsReviewCount } = await persistGroupWithSubordinates({
            supabaseClient,
            paperSetId: activePaperSetId,
            sectionId: dbSec.id,
            grp,
            nodeSequence: nodeSeq++,
            labelPrefix: grpLabel,
            destinationSubject,
          });

          createdQuestionsCount += savedQuestions;
          totalNeedsReview += needsReviewCount;
        }
      }
    }

    if (createdQuestionsCount === 0) {
      const noQuestionsError = "No valid questions could be persisted for this paper set.";
      const rollback = await rollbackCreatedSections(supabaseClient, createdSectionIds);

      let finalError = noQuestionsError;
      const metadata: Record<string, unknown> = {
        total_questions: 0,
        needs_review_count: 0,
        rollback_attempted: rollback.attempted,
        rollback_succeeded: rollback.succeeded,
      };

      if (rollback.attempted && !rollback.succeeded) {
        finalError = `${noQuestionsError} (Partial record rollback failed: ${rollback.cleanupError})`;
        metadata.sections_created = createdSectionsCount;
        metadata.unremoved_section_ids = createdSectionIds;
        metadata.rollback_error = rollback.cleanupError;
      } else {
        metadata.sections_created = 0;
      }

      const updateResult = await updateJobFailureStatus(
        supabaseClient,
        job.id,
        finalError,
        metadata
      );

      let returnedError = finalError;
      if (!updateResult.succeeded) {
        returnedError = `${finalError} (Job failure status update failed: ${updateResult.updateError})`;
      }

      return {
        success: false,
        error: returnedError,
      };
    }

    const finalJobStatus = totalNeedsReview > 0 ? "Needs Review" : "Ready";

    await supabaseClient
      .from("paper_import_jobs")
      .update({
        status: finalJobStatus,
        extraction_metadata: {
          total_questions: createdQuestionsCount,
          sections_created: createdSectionsCount,
          needs_review_count: totalNeedsReview,
          has_warnings: parsed.has_warnings,
          warnings: parsed.warnings,
        },
      })
      .eq("id", job.id);

    try {
      revalidatePath("/admin/question-bank");
      revalidatePath(`/admin/question-bank/papers/${paperSetId}`);
    } catch {
      // Non-fatal when executed outside server action request lifecycle
    }

    return {
      success: true,
      paperSetId,
      jobId: job.id,
      summary: {
        total_questions: createdQuestionsCount,
        sections_created: createdSectionsCount,
        needs_review_count: totalNeedsReview,
      },
    };
  } catch (err: unknown) {
    const originalMessage = err instanceof Error ? err.message : "Persistence failed.";

    // Partial failure rollback: clean up sections created during this failed import run
    const rollback = await rollbackCreatedSections(supabaseClient, createdSectionIds);

    let combinedErrorMessage = originalMessage;
    const failureMetadata: Record<string, unknown> = {
      failure_stage: "persistence",
      rollback_attempted: rollback.attempted,
      rollback_succeeded: rollback.succeeded,
    };

    if (rollback.attempted && !rollback.succeeded) {
      combinedErrorMessage = `${originalMessage} (Partial record rollback failed: ${rollback.cleanupError})`;
      failureMetadata.sections_created = createdSectionsCount;
      failureMetadata.unremoved_section_ids = createdSectionIds;
      failureMetadata.rollback_error = rollback.cleanupError;
    } else {
      failureMetadata.total_questions = 0;
      failureMetadata.sections_created = 0;
      failureMetadata.needs_review_count = 0;
    }

    const updateResult = await updateJobFailureStatus(
      supabaseClient,
      job.id,
      combinedErrorMessage,
      failureMetadata
    );

    let returnedError = `Paper import failed: ${combinedErrorMessage}`;
    if (!updateResult.succeeded) {
      returnedError = `Paper import failed: ${combinedErrorMessage} (Job failure status update failed: ${updateResult.updateError})`;
    }

    return {
      success: false,
      error: returnedError,
    };
  }
}

export async function getPaperImportJobsAction(paperSetId?: string) {
  const { supabase } = await verifyAdmin();

  let query = supabase
    .from("paper_import_jobs")
    .select("*, paper_set_templates ( id, title )")
    .order("created_at", { ascending: false });

  if (paperSetId) {
    query = query.eq("paper_set_id", paperSetId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, jobs: data };
}

export async function updateQuestionVerificationStatusAction(
  questionId: string,
  verification_status:
    | "Ready"
    | "Needs Review"
    | "Missing Image"
    | "Code Needs Review"
    | "Answer Needs Review"
    | "Extraction Warning"
) {
  const { supabase } = await verifyAdmin();

  const { error } = await supabase
    .from("question_templates")
    .update({ verification_status })
    .eq("id", questionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
