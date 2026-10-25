import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  extractRawTextFromPdf,
  parsePaperStructure,
  ExtractedPdfImage,
  ExtractedSection,
} from "../src/lib/pdf/extractor";
import { matchesSubject } from "../src/lib/pdf/subjectMatcher";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SOURCE_PDFS = [
  { code: "CT101", file: "Sem1 CT (1).pdf", subjectName: "Computational Thinking" },
  { code: "ENG101", file: "Sem1 English1 (1).pdf", subjectName: "English 1" },
  { code: "MATH101", file: "Sem1 Maths1 (1).pdf", subjectName: "Mathematics 1" },
  { code: "STAT101", file: "Sem1 Statistics1 (1).pdf", subjectName: "Statistics 1" },
  { code: "PY101", file: "Sem2 Intro to Python (1).pdf", subjectName: "Programming in Python" },
  { code: "ENG102", file: "Sem2 English2 (1).pdf", subjectName: "English 2" },
  { code: "MATH102", file: "Sem2 Maths2 (1).pdf", subjectName: "Mathematics 2" },
  { code: "STAT102", file: "Sem2 Statistics2 (1).pdf", subjectName: "Statistics 2" },
];

const SUBJECT_ORDER = [
  "CT101",
  "ENG101",
  "MATH101",
  "STAT101",
  "PY101",
  "ENG102",
  "MATH102",
  "STAT102",
];

interface UploadedAsset {
  id: string;
  storage_path: string;
  url?: string;
  width: number;
  height: number;
  mime_type: string;
  page_number: number;
}

async function uploadImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  paperId: string,
  images: ExtractedPdfImage[] | undefined,
  prefix: string
): Promise<UploadedAsset[] | null> {
  if (!images || images.length === 0) return null;

  const results: UploadedAsset[] = [];
  for (let idx = 0; idx < images.length; idx++) {
    const img = images[idx];
    const filename = `${prefix}_img_${img.object_id}_p${img.page_number}_${idx}.jpg`;
    const storagePath = `papers/${paperId}/${filename}`;

    const { error: upErr } = await serviceClient.storage
      .from("question_assets")
      .upload(storagePath, img.image_bytes, {
        contentType: img.mime_type || "image/jpeg",
        upsert: true,
      });

    if (upErr && !upErr.message.includes("already exists")) {
      console.warn(`    ⚠️ Image upload warning (${storagePath}):`, upErr.message);
    }

    const { data: urlData } = serviceClient.storage
      .from("question_assets")
      .getPublicUrl(storagePath);

    results.push({
      id: crypto.randomUUID(),
      storage_path: storagePath,
      url: urlData?.publicUrl,
      width: img.width,
      height: img.height,
      mime_type: img.mime_type || "image/jpeg",
      page_number: img.page_number,
    });
  }

  return results.length > 0 ? results : null;
}

export async function loadMay24Papers() {
  console.log("=================================================================");
  console.log("DIRECT MAY 24 QUIZ 1 EXAM DATABASE LOADER");
  console.log("=================================================================\n");

  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const adminClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  // Authenticate Admin
  const { data: aAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: "admin@gmail.com",
    password: "password123",
  });
  if (aErr || !aAuth.user) {
    throw new Error("Admin login failed: " + aErr?.message);
  }
  console.log("✓ Admin authenticated (admin@gmail.com)");

  // ---------------------------------------------------------------------------
  // 1. Fetch Assessment Type & Subjects Metadata
  // ---------------------------------------------------------------------------
  const { data: quiz1Type, error: q1Err } = await serviceClient
    .from("assessment_types")
    .select("id, name")
    .eq("name", "Quiz 1")
    .single();
  if (q1Err || !quiz1Type) {
    throw new Error("Quiz 1 assessment type not found: " + q1Err?.message);
  }

  const { data: subjects, error: subjErr } = await serviceClient
    .from("subjects")
    .select("id, code, name");
  if (subjErr || !subjects) {
    throw new Error("Failed to fetch subjects: " + subjErr?.message);
  }
  const subjectMap = new Map(subjects.map((s) => [s.code, s]));

  // ---------------------------------------------------------------------------
  // 2. Idempotent Teardown of Previous May 24 Test Fixture Records
  // ---------------------------------------------------------------------------
  console.log("\n[1/6] Cleaning up previous May 24 fixture records (idempotent teardown)...");

  // 2.1 Delete previous attempts, responses, results
  await serviceClient.from("responses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await serviceClient.from("results").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await serviceClient.from("attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 2.2 Delete previous assessment events titled "May 24"
  const { data: prevEvents } = await serviceClient
    .from("assessment_events")
    .select("id")
    .eq("title", "May 24");
  for (const ev of prevEvents || []) {
    await serviceClient.from("assessment_subjects").delete().eq("assessment_event_id", ev.id);
    await serviceClient.from("assessment_events").delete().eq("id", ev.id);
  }

  // 2.3 Delete previous published versions titled "May 24"
  // Version tables have enforce immutability triggers: disable triggers temporarily for cleanup
  const { data: prevVersions } = await serviceClient
    .from("paper_set_versions")
    .select("id")
    .eq("title", "May 24");

  if (prevVersions && prevVersions.length > 0) {
    const vIds = prevVersions.map((v) => `'${v.id}'`).join(",");
    const disableTriggersSql = `
      ALTER TABLE paper_set_versions DISABLE TRIGGER enforce_paper_version_immutability;
      ALTER TABLE section_versions DISABLE TRIGGER enforce_section_version_immutability;
      ALTER TABLE group_versions DISABLE TRIGGER enforce_group_version_immutability;
      ALTER TABLE question_versions DISABLE TRIGGER enforce_question_version_immutability;
      ALTER TABLE option_versions DISABLE TRIGGER enforce_option_version_immutability;
      ALTER TABLE eval_mcq_msq_versions DISABLE TRIGGER enforce_eval_mcq_immutability;
      ALTER TABLE eval_numeric_versions DISABLE TRIGGER enforce_eval_num_immutability;

      DELETE FROM eval_numeric_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds})));
      DELETE FROM eval_mcq_msq_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds})));
      DELETE FROM option_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds})));
      DELETE FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds}));
      DELETE FROM section_content_node_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds}));
      DELETE FROM group_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id IN (${vIds}));
      DELETE FROM section_versions WHERE paper_set_version_id IN (${vIds});
      DELETE FROM paper_set_versions WHERE id IN (${vIds});

      ALTER TABLE paper_set_versions ENABLE TRIGGER enforce_paper_version_immutability;
      ALTER TABLE section_versions ENABLE TRIGGER enforce_section_version_immutability;
      ALTER TABLE group_versions ENABLE TRIGGER enforce_group_version_immutability;
      ALTER TABLE question_versions ENABLE TRIGGER enforce_question_version_immutability;
      ALTER TABLE option_versions ENABLE TRIGGER enforce_option_version_immutability;
      ALTER TABLE eval_mcq_msq_versions ENABLE TRIGGER enforce_eval_mcq_immutability;
      ALTER TABLE eval_numeric_versions ENABLE TRIGGER enforce_eval_num_immutability;
    `;
    const { error: sqlErr } = await serviceClient.rpc("execute_sql_admin", {
      query: disableTriggersSql,
    });
    if (sqlErr) {
      // Fallback: execute via psql inside container if RPC does not exist
      const { execSync } = await import("child_process");
      execSync(
        `docker exec supabase_db_iitm_test_platform psql -U postgres -d postgres -c "${disableTriggersSql.replace(/"/g, '\\"')}"`
      );
    }
  }

  // 2.4 Delete previous paper set templates titled "May 24"
  const { data: prevTemplates } = await serviceClient
    .from("paper_set_templates")
    .select("id")
    .eq("title", "May 24");
  for (const t of prevTemplates || []) {
    const { data: sec } = await serviceClient.from("section_templates").select("id").eq("paper_set_id", t.id);
    const secIds = (sec || []).map((s) => s.id);
    await serviceClient.from("section_content_nodes").delete().in("section_id", secIds);
    await serviceClient.from("question_templates").delete().in("section_id", secIds);
    await serviceClient.from("section_templates").delete().in("id", secIds);
    await serviceClient.from("paper_set_templates").delete().eq("id", t.id);
  }
  console.log("✓ Teardown complete. Workspace is pristine for direct loading.");

  // ---------------------------------------------------------------------------
  // 3. Extract & Construct Data Directly from the 8 Original PDFs
  // ---------------------------------------------------------------------------
  console.log("\n[2/6] Extracting and constructing paper data from the 8 original PDFs...");

  const createdPaperMap = new Map<
    string,
    {
      paperId: string;
      subjectId: string;
      subjectCode: string;
      totalQuestions: number;
      totalGroups: number;
    }
  >();

  for (const item of SOURCE_PDFS) {
    const subj = subjectMap.get(item.code);
    if (!subj) throw new Error(`Subject not found for code: ${item.code}`);

    const pdfPath = path.resolve(process.cwd(), "pyqs/may24quiz1", item.file);
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Source PDF file not found: ${pdfPath}`);
    }

    console.log(`\nProcessing [${item.code}] ${item.subjectName} from "${item.file}"...`);
    const buf = fs.readFileSync(pdfPath);

    // Authoritative raw extraction
    const { rawText, hasImages, imagesMap } = extractRawTextFromPdf(buf);
    const parsed = parsePaperStructure(rawText, hasImages, imagesMap);

    // Find the section corresponding to this subject, excluding (Preceding) leftover sections
    let matchingSection: ExtractedSection | undefined = parsed.sections.find((s) =>
      !s.title.includes("(Preceding)") &&
      matchesSubject(s.subject_name || s.title, { name: item.subjectName, code: item.code })
    );

    // Fallback: if single section in PDF, use section 0
    if (!matchingSection && parsed.sections.length === 1) {
      matchingSection = parsed.sections[0];
    }
    // Fallback: search by title excluding (Preceding)
    if (!matchingSection) {
      matchingSection = parsed.sections.find((s) =>
        !s.title.includes("(Preceding)") &&
        (s.title.toLowerCase().includes(item.code.toLowerCase()) ||
         s.title.toLowerCase().includes(item.subjectName.toLowerCase()))
      );
    }

    if (!matchingSection) {
      throw new Error(`Could not find matching section for [${item.code}] in ${item.file}`);
    }

    // For STAT102, if there is a trailing section containing Q178 (confirmation question), include it
    if (item.code === "STAT102") {
      const extraSec = parsed.sections.find((s) => s.title.includes("AppDev1") || s.title.includes("Section 9"));
      if (extraSec && extraSec.items) {
        matchingSection.items = [...(matchingSection.items || []), ...extraSec.items];
      }
    }

    // Create Draft Paper Template
    const { data: paperTemplate, error: pErr } = await serviceClient
      .from("paper_set_templates")
      .insert({
        subject_id: subj.id,
        assessment_type_id: quiz1Type.id,
        title: "May 24",
        status: "Draft",
      })
      .select()
      .single();

    if (pErr || !paperTemplate) {
      throw new Error(`Failed to create paper template for [${item.code}]: ${pErr?.message}`);
    }

    // Upload section reference material images if any
    let sectionRefMaterial: unknown | null = matchingSection.reference_material || null;
    if (matchingSection.reference_material_images && matchingSection.reference_material_images.length > 0) {
      const uploadedRefImages = await uploadImages(
        serviceClient,
        paperTemplate.id,
        matchingSection.reference_material_images,
        "section_ref"
      );
      if (uploadedRefImages) {
        sectionRefMaterial = {
          title: "Useful Data / Reference Material",
          images: uploadedRefImages,
        };
      }
    }

    // Create Section Template
    const { data: sectionTemplate, error: secErr } = await serviceClient
      .from("section_templates")
      .insert({
        paper_set_id: paperTemplate.id,
        title: matchingSection.title || `Section 1: ${item.subjectName}`,
        reference_material: sectionRefMaterial,
      })
      .select()
      .single();

    if (secErr || !sectionTemplate) {
      throw new Error(`Failed to create section for [${item.code}]: ${secErr?.message}`);
    }

    let nodeSequence = 1;
    let questionsCount = 0;
    let groupsCount = 0;

    // Process section items in exact sequential order
    const items = matchingSection.items || [];
    for (const itemNode of items) {
      if (itemNode.type === "QUESTION") {
        const q = itemNode.question;
        const qSource = `PDF Import (Q${q.question_number || nodeSequence})`;

        // Upload question images
        const qAssets = await uploadImages(
          serviceClient,
          paperTemplate.id,
          q.images,
          `q${q.question_number || nodeSequence}`
        );

        // Insert Question
        const { data: insertedQ, error: qErr } = await serviceClient
          .from("question_templates")
          .insert({
            section_id: sectionTemplate.id,
            group_id: null,
            type: q.type,
            text: q.text || `Question ${q.question_number}`,
            marks: q.marks >= 0 ? q.marks : 1,
            verification_status: "Ready",
            source: qSource,
            image_assets: qAssets,
            code_content: q.code_content || null,
          })
          .select()
          .single();

        if (qErr || !insertedQ) {
          throw new Error(`Failed to insert question ${qSource}: ${qErr?.message}`);
        }

        // Insert Section Content Node
        const { error: nodeErr } = await serviceClient.from("section_content_nodes").insert({
          section_id: sectionTemplate.id,
          node_type: "QUESTION",
          question_id: insertedQ.id,
          group_id: null,
          sequence: nodeSequence++,
        });
        if (nodeErr) {
          throw new Error(`Failed to insert question content node for ${qSource}: ${nodeErr.message}`);
        }

        // Insert Options
        if (q.type === "MCQ" || q.type === "MSQ") {
          // Process options & upload option images
          for (let oIdx = 0; oIdx < q.options.length; oIdx++) {
            const opt = q.options[oIdx];
            const optAssets = await uploadImages(
              serviceClient,
              paperTemplate.id,
              opt.images,
              `q${q.question_number || nodeSequence}_opt${oIdx + 1}`
            );

            const { data: insertedOpt, error: optErr } = await serviceClient
              .from("option_templates")
              .insert({
                question_id: insertedQ.id,
                sequence: opt.sequence || oIdx + 1,
                text: opt.text || (optAssets ? "[Image]" : ""),
                image_assets: optAssets,
              })
              .select()
              .single();

            if (optErr || !insertedOpt) {
              throw new Error(`Failed to insert option for ${qSource}: ${optErr?.message}`);
            }

            // Insert Evaluation Key
            if (opt.is_correct) {
              await serviceClient.from("eval_mcq_msq_templates").insert({
                question_id: insertedQ.id,
                correct_option_id: insertedOpt.id,
              });
            }
          }
        } else if (q.type === "NUMERICAL" && q.eval_numeric) {
          await serviceClient.from("eval_numeric_templates").insert({
            question_id: insertedQ.id,
            mode: q.eval_numeric.mode,
            exact_val: q.eval_numeric.exact_val,
            min_val: q.eval_numeric.min_val,
            max_val: q.eval_numeric.max_val,
          });
        }

        questionsCount++;
      } else if (itemNode.type === "GROUP") {
        const grp = itemNode.group;
        groupsCount++;

        // Upload group passage images
        const groupAssets = await uploadImages(
          serviceClient,
          paperTemplate.id,
          grp.images,
          `grp_${groupsCount}`
        );

        // Insert Group Template
        const { data: insertedGrp, error: grpErr } = await serviceClient
          .from("group_templates")
          .insert({
            section_id: sectionTemplate.id,
            title: grp.title || `Comprehension Group ${groupsCount}`,
            passage: grp.passage || "",
            image_assets: groupAssets,
            code_content: grp.code_content || null,
          })
          .select()
          .single();

        if (grpErr || !insertedGrp) {
          throw new Error(`Failed to insert group in [${item.code}]: ${grpErr?.message}`);
        }

        // Insert Section Content Node for Group
        const { error: grpNodeErr } = await serviceClient.from("section_content_nodes").insert({
          section_id: sectionTemplate.id,
          node_type: "GROUP",
          question_id: null,
          group_id: insertedGrp.id,
          sequence: nodeSequence++,
        });
        if (grpNodeErr) {
          throw new Error(`Failed to insert group content node in [${item.code}]: ${grpNodeErr.message}`);
        }

        // Insert Group Child Questions
        for (let gqIdx = 0; gqIdx < grp.questions.length; gqIdx++) {
          const gq = grp.questions[gqIdx];
          const gqSource = `PDF Import (Q${gq.question_number || gqIdx + 1})`;

          const gqAssets = await uploadImages(
            serviceClient,
            paperTemplate.id,
            gq.images,
            `gq${gq.question_number || gqIdx + 1}`
          );

          const { data: insertedGQ, error: gqErr } = await serviceClient
            .from("question_templates")
            .insert({
              section_id: null,
              group_id: insertedGrp.id,
              type: gq.type,
              text: gq.text || `Question ${gq.question_number}`,
              marks: gq.marks >= 0 ? gq.marks : 1,
              verification_status: "Ready",
              source: gqSource,
              image_assets: gqAssets,
              code_content: gq.code_content || null,
            })
            .select()
            .single();

          if (gqErr || !insertedGQ) {
            throw new Error(`Failed to insert group question ${gqSource}: ${gqErr?.message}`);
          }

          // Insert Options
          if (gq.type === "MCQ" || gq.type === "MSQ") {
            for (let oIdx = 0; oIdx < gq.options.length; oIdx++) {
              const opt = gq.options[oIdx];
              const optAssets = await uploadImages(
                serviceClient,
                paperTemplate.id,
                opt.images,
                `gq${gq.question_number}_opt${oIdx + 1}`
              );

              const { data: insertedOpt, error: optErr } = await serviceClient
                .from("option_templates")
                .insert({
                  question_id: insertedGQ.id,
                  sequence: opt.sequence || oIdx + 1,
                  text: opt.text || (optAssets ? "[Image]" : ""),
                  image_assets: optAssets,
                })
                .select()
                .single();

              if (optErr || !insertedOpt) {
                throw new Error(`Failed to insert option for group question: ${optErr?.message}`);
              }

              if (opt.is_correct) {
                await serviceClient.from("eval_mcq_msq_templates").insert({
                  question_id: insertedGQ.id,
                  correct_option_id: insertedOpt.id,
                });
              }
            }
          } else if (gq.type === "NUMERICAL" && gq.eval_numeric) {
            await serviceClient.from("eval_numeric_templates").insert({
              question_id: insertedGQ.id,
              mode: gq.eval_numeric.mode,
              exact_val: gq.eval_numeric.exact_val,
              min_val: gq.eval_numeric.min_val,
              max_val: gq.eval_numeric.max_val,
            });
          }

          questionsCount++;
        }
      }
    }

    console.log(
      `✓ [${item.code}] Loaded: ${questionsCount} questions across ${groupsCount} groups + standalone items.`
    );

    createdPaperMap.set(item.code, {
      paperId: paperTemplate.id,
      subjectId: subj.id,
      subjectCode: item.code,
      totalQuestions: questionsCount,
      totalGroups: groupsCount,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Validate and Publish All 8 Papers via RPC
  // ---------------------------------------------------------------------------
  console.log("\n[3/6] Validating and publishing all 8 papers via publication RPC...");
  const publishedVersionsMap = new Map<string, string>();

  for (const code of SUBJECT_ORDER) {
    const info = createdPaperMap.get(code);
    if (!info) throw new Error(`Missing paper info for ${code}`);

    console.log(`\nValidating [${code}]...`);
    const { data: isValid, error: valErr } = await serviceClient.rpc(
      "validate_paper_for_publishing",
      { p_paper_set_id: info.paperId }
    );
    if (valErr || !isValid) {
      throw new Error(`Validation failed for [${code}]: ${valErr?.message}`);
    }
    console.log(`✓ Validation passed for [${code}]`);

    const { data: versionId, error: pubErr } = await adminClient.rpc(
      "publish_paper_set_template",
      { p_paper_set_id: info.paperId }
    );
    if (pubErr || !versionId) {
      throw new Error(`Publishing failed for [${code}]: ${pubErr?.message}`);
    }
    console.log(`✓ Published [${code}] -> Version ID: ${versionId}`);
    publishedVersionsMap.set(code, versionId);
  }

  // ---------------------------------------------------------------------------
  // 5. Create the May 24 Assessment Event & Assign 8 Subjects
  // ---------------------------------------------------------------------------
  console.log("\n[4/6] Creating 'May 24' Assessment Event & assigning 8 subjects...");

  const { data: newEvent, error: evErr } = await serviceClient
    .from("assessment_events")
    .insert({
      title: "May 24",
      assessment_type_id: quiz1Type.id,
      scheduled_start: new Date().toISOString(),
      status: "Live",
    })
    .select()
    .single();

  if (evErr || !newEvent) {
    throw new Error("Failed to create assessment event: " + evErr?.message);
  }
  console.log(`✓ Created Assessment Event: "${newEvent.title}" (ID: ${newEvent.id})`);

  for (const code of SUBJECT_ORDER) {
    const info = createdPaperMap.get(code);
    const versionId = publishedVersionsMap.get(code);
    if (!info || !versionId) throw new Error(`Missing info for ${code}`);

    const { data: asRow, error: asErr } = await serviceClient
      .from("assessment_subjects")
      .insert({
        assessment_event_id: newEvent.id,
        subject_id: info.subjectId,
        paper_set_version_id: versionId,
      })
      .select()
      .single();

    if (asErr || !asRow) {
      throw new Error(`Failed to assign [${code}] to assessment: ${asErr?.message}`);
    }
    console.log(`✓ Assigned [${code}] -> Version ${versionId} (AS ID: ${asRow.id})`);
  }

  // ---------------------------------------------------------------------------
  // 6. Setup Test Student (test@gmail.com) with 8 Active Enrollments
  // ---------------------------------------------------------------------------
  console.log("\n[5/6] Ensuring test student (test@gmail.com) has active enrollments...");

  let { data: studentUser } = await serviceClient
    .from("users")
    .select("id, email, name, role")
    .eq("email", "test@gmail.com")
    .maybeSingle();

  if (!studentUser) {
    // Create student user if not exists
    const { data: newAuthUser, error: authErr } = await serviceClient.auth.admin.createUser({
      email: "test@gmail.com",
      password: "password123",
      email_confirm: true,
      user_metadata: { role: "student", name: "Test Student" },
    });
    if (authErr || !newAuthUser.user) {
      throw new Error("Failed to create test student: " + authErr?.message);
    }
    const { data: uRow } = await serviceClient
      .from("users")
      .select("id, email, name, role")
      .eq("id", newAuthUser.user.id)
      .single();
    studentUser = uRow;
  }

  for (const code of SUBJECT_ORDER) {
    const subj = subjectMap.get(code)!;
    const { data: existingEnrollment } = await serviceClient
      .from("student_enrollments")
      .select("id, is_active")
      .eq("student_id", studentUser!.id)
      .eq("subject_id", subj.id)
      .maybeSingle();

    if (existingEnrollment) {
      if (!existingEnrollment.is_active) {
        await serviceClient
          .from("student_enrollments")
          .update({ is_active: true })
          .eq("id", existingEnrollment.id);
      }
    } else {
      await serviceClient.from("student_enrollments").insert({
        student_id: studentUser!.id,
        subject_id: subj.id,
        is_active: true,
      });
    }
  }
  console.log("✓ Test student enrolled in all 8 subjects.");

  // ---------------------------------------------------------------------------
  // 7. Verification of Final Database State
  // ---------------------------------------------------------------------------
  console.log("\n[6/6] Verifying final database state & integrity invariants...");

  const { count: attemptCount } = await serviceClient
    .from("attempts")
    .select("*", { count: "exact", head: true });
  const { count: respCount } = await serviceClient
    .from("responses")
    .select("*", { count: "exact", head: true });
  const { count: resCount } = await serviceClient
    .from("results")
    .select("*", { count: "exact", head: true });

  console.log(`  - Student Attempts count: ${attemptCount} (Must be 0)`);
  console.log(`  - Student Responses count: ${respCount} (Must be 0)`);
  console.log(`  - Student Results count: ${resCount} (Must be 0)`);

  if (attemptCount !== 0 || respCount !== 0 || resCount !== 0) {
    throw new Error("Integrity check failed: attempts/responses/results are not 0!");
  }

  console.log("\n=================================================================");
  console.log("DIRECT MAY 24 PAPERS LOADING COMPLETED SUCCESSFULLY! 🎉");
  console.log("=================================================================\n");
}

if (require.main === module || process.argv[1]?.endsWith("load-may24-papers.ts")) {
  loadMay24Papers().catch((err) => {
    console.error("\n❌ LOADER EXECUTION FAILED:", err);
    process.exit(1);
  });
}
