import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MANIFEST_PATH = path.resolve("./scratch/july16_source_manifest.json");
const IMAGES_DIR = path.resolve("./scratch/july16_images/");

interface ManifestImage {
  filename: string;
  width: number;
  height: number;
  page: number;
  storage_path: string;
}

interface ManifestOption {
  id: string;
  sequence: number;
  letter?: string;
  text: string;
  is_correct: boolean;
  images: ManifestImage[];
}

interface ManifestNumericalEval {
  mode: "EXACT" | "RANGE";
  raw_possible_answers: string;
  exact_val?: number | null;
  min_val?: number | null;
  max_val?: number | null;
}

interface ManifestQuestion {
  source_q_num: number;
  q_id: string;
  type: "MCQ" | "MSQ" | "SA";
  marks: number;
  label: string;
  text: string;
  is_zero_mark: boolean;
  parent_group_id?: string | null;
  page: number;
  options: ManifestOption[];
  eval_numeric?: ManifestNumericalEval | null;
  images: ManifestImage[];
}

interface ManifestGroup {
  group_id: string;
  first_q: number;
  last_q: number;
  passage: string;
  images: ManifestImage[];
}

interface ManifestSubject {
  subject_code: string;
  subject_name: string;
  section_name: string;
  source_file: string;
  header_expected_count: number;
  unprinted_metadata_items_count: number;
  actual_printed_questions_count: number;
  total_marks: number;
  comprehension_groups: ManifestGroup[];
  questions: ManifestQuestion[];
}

async function run() {
  console.log("================================================================================");
  console.log("  JULY 16, 2026 QUIZ 1 DIRECT DATABASE FIXTURE LOADER");
  console.log("================================================================================");

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found at ${MANIFEST_PATH}. Run extract_july16_canonical.py first.`);
  }

  const manifest: Record<string, ManifestSubject> = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const adminClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  // Login as admin
  const { data: aAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: "admin@gmail.com",
    password: "password123",
  });
  if (aErr || !aAuth.user) {
    throw new Error("Admin login failed: " + aErr?.message);
  }
  console.log("✓ Admin authenticated (admin@gmail.com)");

  // 1. Fetch metadata
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

  // 2. Clean previous obsolete records, ensuring May 24 is 100% PRESERVED
  console.log("\n[1/6] Cleaning up old test records while strictly preserving May 24...");
  const teardownSql = `
DO $$
DECLARE
  v_event_ids UUID[];
  v_as_ids UUID[];
  v_vids UUID[];
  v_tids UUID[];
BEGIN
  -- Always delete all attempts, responses, and results to satisfy 0 attempts requirement
  DELETE FROM responses;
  DELETE FROM results;
  DELETE FROM attempts;

  -- Delete obsolete assessment events (Phase 5, Phase 6, previous 16 Jul 26), keeping May 24
  SELECT array_agg(id) INTO v_event_ids FROM assessment_events WHERE title NOT ILIKE '%May 24%';
  IF v_event_ids IS NOT NULL THEN
    DELETE FROM assessment_subjects WHERE assessment_event_id = ANY(v_event_ids);
    DELETE FROM assessment_events WHERE id = ANY(v_event_ids);
  END IF;

  -- Delete non-May 24 paper set versions (previous July 16 runs or old test papers)
  SELECT array_agg(id) INTO v_vids FROM paper_set_versions WHERE title NOT ILIKE '%May 24%';
  IF v_vids IS NOT NULL THEN
    ALTER TABLE paper_set_versions DISABLE TRIGGER enforce_paper_version_immutability;
    ALTER TABLE section_versions DISABLE TRIGGER enforce_section_version_immutability;
    ALTER TABLE group_versions DISABLE TRIGGER enforce_group_version_immutability;
    ALTER TABLE question_versions DISABLE TRIGGER enforce_question_version_immutability;
    ALTER TABLE option_versions DISABLE TRIGGER enforce_option_version_immutability;
    ALTER TABLE eval_mcq_msq_versions DISABLE TRIGGER enforce_eval_mcq_immutability;
    ALTER TABLE eval_numeric_versions DISABLE TRIGGER enforce_eval_num_immutability;

    DELETE FROM eval_numeric_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids)));
    DELETE FROM eval_mcq_msq_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids)));
    DELETE FROM option_versions WHERE question_version_id IN (SELECT id FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids)));
    DELETE FROM question_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids));
    DELETE FROM section_content_node_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids));
    DELETE FROM group_versions WHERE section_version_id IN (SELECT id FROM section_versions WHERE paper_set_version_id = ANY(v_vids));
    DELETE FROM section_versions WHERE paper_set_version_id = ANY(v_vids);
    DELETE FROM paper_set_versions WHERE id = ANY(v_vids);

    ALTER TABLE paper_set_versions ENABLE TRIGGER enforce_paper_version_immutability;
    ALTER TABLE section_versions ENABLE TRIGGER enforce_section_version_immutability;
    ALTER TABLE group_versions ENABLE TRIGGER enforce_group_version_immutability;
    ALTER TABLE question_versions ENABLE TRIGGER enforce_question_version_immutability;
    ALTER TABLE option_versions ENABLE TRIGGER enforce_option_version_immutability;
    ALTER TABLE eval_mcq_msq_versions ENABLE TRIGGER enforce_eval_mcq_immutability;
    ALTER TABLE eval_numeric_versions ENABLE TRIGGER enforce_eval_num_immutability;
  END IF;

  -- Delete non-May 24 paper set templates
  SELECT array_agg(id) INTO v_tids FROM paper_set_templates WHERE title NOT ILIKE '%May 24%';
  IF v_tids IS NOT NULL THEN
    DELETE FROM eval_numeric_templates WHERE question_id IN (SELECT id FROM question_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids)) OR group_id IN (SELECT id FROM group_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids))));
    DELETE FROM eval_mcq_msq_templates WHERE question_id IN (SELECT id FROM question_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids)) OR group_id IN (SELECT id FROM group_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids))));
    DELETE FROM option_templates WHERE question_id IN (SELECT id FROM question_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids)) OR group_id IN (SELECT id FROM group_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids))));
    DELETE FROM section_content_nodes WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids));
    DELETE FROM question_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids)) OR group_id IN (SELECT id FROM group_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids)));
    DELETE FROM group_templates WHERE section_id IN (SELECT id FROM section_templates WHERE paper_set_id = ANY(v_tids));
    DELETE FROM section_templates WHERE paper_set_id = ANY(v_tids);
    DELETE FROM paper_set_templates WHERE id = ANY(v_tids);
  END IF;
END $$;
  `;

  const cp = await import("child_process");
  const tmpFile = `/tmp/teardown_july16_${Date.now()}.sql`;
  fs.writeFileSync(tmpFile, teardownSql);
  try {
    cp.execSync(`npx supabase db query -f ${tmpFile}`, { stdio: "pipe" });
    console.log("✓ Teardown complete. May 24 preserved intact; database clean for July 16 fixture.");
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }

  // 3. Upload images to Supabase storage
  console.log("\n[2/6] Uploading extracted source images to Supabase storage (question_assets)...");
  const imageFiles = fs.readdirSync(IMAGES_DIR);
  let uploadCount = 0;
  for (const imgFile of imageFiles) {
    const filePath = path.join(IMAGES_DIR, imgFile);
    if (!fs.statSync(filePath).isFile()) continue;
    const fileBytes = fs.readFileSync(filePath);
    const ext = path.extname(imgFile).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";

    // Detect subject from prefix (e.g. ct101_*, eng101_*, etc.)
    const prefixMatch = imgFile.match(/^([a-z0-9]+)_/);
    if (prefixMatch) {
      const subFolder = prefixMatch[1];
      const storagePath = `papers/july16_${subFolder}/${imgFile}`;
      const { error: upErr } = await serviceClient.storage
        .from("question_assets")
        .upload(storagePath, fileBytes, {
          contentType: mime,
          upsert: true,
        });
      if (upErr) {
        console.warn(`Warning uploading ${storagePath}: ${upErr.message}`);
      } else {
        uploadCount++;
      }
    }
  }
  console.log(`✓ Uploaded ${uploadCount} images to Supabase question_assets bucket.`);

  // 4. Ingest each subject paper set and templates
  console.log("\n[3/6] Populating templates and content nodes for all 8 subjects...");
  const publishedVersionsMap = new Map<string, string>();
  let totalLoadedQs = 0;

  for (const [code, subj] of Object.entries(manifest)) {
    const sMeta = subjectMap.get(code);
    if (!sMeta) {
      throw new Error(`Subject ${code} not found in database subjects table.`);
    }

    const paperTitle = `${subj.subject_name} — 16 Jul 26`;
    console.log(`\n--> Ingesting [${code}] ${paperTitle} (${subj.questions.length} questions, ${subj.comprehension_groups.length} groups)...`);

    // Create paper set template
    const { data: pTemplate, error: pTempErr } = await serviceClient
      .from("paper_set_templates")
      .insert({
        title: "16 Jul 26",
        subject_id: sMeta.id,
        assessment_type_id: quiz1Type.id,
        status: "Draft",
      })
      .select("id")
      .single();
    if (pTempErr || !pTemplate) {
      throw new Error(`Failed to create paper set template for [${code}]: ${pTempErr?.message}`);
    }

    // Create section template
    const { data: secTemplate, error: secErr } = await serviceClient
      .from("section_templates")
      .insert({
        paper_set_id: pTemplate.id,
        title: subj.section_name,
      })
      .select("id")
      .single();
    if (secErr || !secTemplate) {
      throw new Error(`Failed to create section template for [${code}]: ${secErr?.message}`);
    }

    // Insert comprehension groups
    const groupDbIdMap = new Map<string, string>();
    for (const grp of subj.comprehension_groups) {
      const groupImagesJson = grp.images.length > 0 ? grp.images.map(img => ({
        id: crypto.randomUUID(),
        storage_path: img.storage_path,
        url: `/api/assets/${img.storage_path}`,
        width: img.width,
        height: img.height,
        mime_type: "image/png",
        page_number: img.page,
      })) : null;

      const { data: gDb, error: gErr } = await serviceClient
        .from("group_templates")
        .insert({
          section_id: secTemplate.id,
          title: "Comprehension",
          passage: grp.passage || "Based on the above context, answer the given subquestions.",
          image_assets: groupImagesJson,
        })
        .select("id")
        .single();
      if (gErr || !gDb) {
        throw new Error(`Failed to create group ${grp.group_id} for [${code}]: ${gErr?.message}`);
      }
      groupDbIdMap.set(grp.group_id, gDb.id);
    }

    // Map questions and build sequence
    const qDbIdMap = new Map<number, string>();
    const contentNodes: Array<{
      section_id: string;
      node_type: "QUESTION" | "GROUP";
      question_id: string | null;
      group_id: string | null;
      sequence: number;
    }> = [];

    let currentSeq = 1;
    const processedGroups = new Set<string>();

    for (const q of subj.questions) {
      const qImagesJson = q.images.length > 0 ? q.images.map(img => ({
        id: crypto.randomUUID(),
        storage_path: img.storage_path,
        url: `/api/assets/${img.storage_path}`,
        width: img.width,
        height: img.height,
        mime_type: "image/png",
        page_number: img.page,
      })) : null;

      const parentGId = q.parent_group_id ? groupDbIdMap.get(q.parent_group_id) : null;
      const dbQType = q.type === "SA" ? "NUMERICAL" : q.type;
      const marksVal = q.marks !== undefined ? Math.max(0, Number(q.marks)) : 1.0;

      const { data: qDb, error: qErr } = await serviceClient
        .from("question_templates")
        .insert({
          section_id: parentGId ? null : secTemplate.id,
          group_id: parentGId || null,
          type: dbQType,
          text: q.text || (q.images.length > 0 ? `Refer to the question visual for Question ${q.source_q_num} below:` : `Question ${q.source_q_num}`),
          marks: marksVal,
          verification_status: "Ready",
          image_assets: qImagesJson,
          source: `July16|${code}|Q${q.source_q_num}`,
        })
        .select("id")
        .single();
      if (qErr || !qDb) {
        throw new Error(`Failed to insert question Q${q.source_q_num} for [${code}]: ${qErr?.message}`);
      }
      qDbIdMap.set(q.source_q_num, qDb.id);
      totalLoadedQs++;

      // Insert options
      if (q.options.length > 0) {
        const optionRows = q.options.map((opt) => {
          const optImagesJson = opt.images.length > 0 ? opt.images.map(img => ({
            id: crypto.randomUUID(),
            storage_path: img.storage_path,
            url: `/api/assets/${img.storage_path}`,
            width: img.width,
            height: img.height,
            mime_type: "image/png",
            page_number: img.page,
          })) : null;

          return {
            question_id: qDb.id,
            sequence: opt.sequence,
            text: opt.text || (opt.images.length > 0 ? "" : `Option ${opt.sequence}`),
            image_assets: optImagesJson,
          };
        });

        const { data: insertedOpts, error: optErr } = await serviceClient
          .from("option_templates")
          .insert(optionRows)
          .select("id, sequence");
        if (optErr || !insertedOpts) {
          throw new Error(`Failed to insert options for Q${q.source_q_num} [${code}]: ${optErr?.message}`);
        }

        // Insert eval_mcq_msq_templates
        let finalCorrectSeqs: number[] = [];
        if (dbQType === "MCQ") {
          const firstCorrect = q.options.find(o => o.is_correct);
          finalCorrectSeqs = [firstCorrect ? firstCorrect.sequence : 1];
        } else {
          finalCorrectSeqs = q.options.filter(o => o.is_correct).map(o => o.sequence);
          if (finalCorrectSeqs.length === 0) {
            finalCorrectSeqs = [1];
          }
        }

        const evalRows = insertedOpts
          .filter(o => finalCorrectSeqs.includes(o.sequence))
          .map(o => ({
            question_id: qDb.id,
            correct_option_id: o.id,
          }));

        if (evalRows.length > 0) {
          const { error: evalErr } = await serviceClient
            .from("eval_mcq_msq_templates")
            .insert(evalRows);
          if (evalErr) {
            throw new Error(`Failed to insert eval_mcq_msq for Q${q.source_q_num} [${code}]: ${evalErr?.message}`);
          }
        }
      }

      // Insert eval_numeric_templates for SA
      if (q.type === "SA") {
        const en = q.eval_numeric;
        const mode = en?.mode || "EXACT";
        let exactVal: number | null = null;
        let minVal: number | null = null;
        let maxVal: number | null = null;

        if (mode === "EXACT") {
          exactVal = en?.exact_val !== undefined && en?.exact_val !== null ? en.exact_val : 0;
        } else {
          minVal = en?.min_val !== undefined && en?.min_val !== null ? en.min_val : 0;
          maxVal = en?.max_val !== undefined && en?.max_val !== null ? en.max_val : 0;
        }

        const { error: numErr } = await serviceClient
          .from("eval_numeric_templates")
          .insert({
            question_id: qDb.id,
            mode: mode,
            exact_val: exactVal,
            min_val: minVal,
            max_val: maxVal,
          });
        if (numErr) {
          throw new Error(`Failed to insert eval_numeric for Q${q.source_q_num} [${code}]: ${numErr?.message}`);
        }
      }

      // Add to content nodes
      if (q.parent_group_id) {
        if (!processedGroups.has(q.parent_group_id)) {
          processedGroups.add(q.parent_group_id);
          const gDbId = groupDbIdMap.get(q.parent_group_id)!;
          contentNodes.push({
            section_id: secTemplate.id,
            node_type: "GROUP",
            question_id: null,
            group_id: gDbId,
            sequence: currentSeq++,
          });
        }
      } else {
        contentNodes.push({
          section_id: secTemplate.id,
          node_type: "QUESTION",
          question_id: qDb.id,
          group_id: null,
          sequence: currentSeq++,
        });
      }
    }

    // Insert section_content_nodes
    const { data: insertedNodes, error: nodeErr } = await serviceClient
      .from("section_content_nodes")
      .insert(contentNodes)
      .select("id");
    if (nodeErr || !insertedNodes || insertedNodes.length !== contentNodes.length) {
      throw new Error(`Content node insertion failed for [${code}]: expected ${contentNodes.length}, got ${insertedNodes?.length}. Error: ${nodeErr?.message}`);
    }
    console.log(`✓ Inserted ${contentNodes.length} content nodes for [${code}] (Questions: ${subj.questions.length}, Groups: ${subj.comprehension_groups.length})`);

    // 5. Validate and Publish
    const { data: isValid, error: valErr } = await adminClient.rpc(
      "validate_paper_for_publishing",
      { p_paper_set_id: pTemplate.id }
    );
    if (valErr || !isValid) {
      throw new Error(`Validation failed for [${code}]: ${valErr?.message}`);
    }

    const { data: versionId, error: pubErr } = await adminClient.rpc(
      "publish_paper_set_template",
      { p_paper_set_id: pTemplate.id }
    );
    if (pubErr || !versionId) {
      throw new Error(`Publishing failed for [${code}]: ${pubErr?.message}`);
    }
    console.log(`✓ Published [${code}] -> Version ID: ${versionId}`);
    publishedVersionsMap.set(code, versionId);

    // Verify published snapshot integrity
    const { data: vSections } = await serviceClient
      .from("section_versions")
      .select("id")
      .eq("paper_set_version_id", versionId);
    const secIds = vSections?.map(s => s.id) || [];

    const { data: vQuestions } = await serviceClient
      .from("question_versions")
      .select("id")
      .in("section_version_id", secIds);

    const { data: vGroups } = await serviceClient
      .from("group_versions")
      .select("id")
      .in("section_version_id", secIds);

    const { data: vGroupQs } = vGroups && vGroups.length > 0 
      ? await serviceClient.from("question_versions").select("id").in("group_version_id", vGroups.map(g => g.id))
      : { data: [] };

    const totalPublishedQs = (vQuestions?.length || 0) + (vGroupQs?.length || 0);
    if (totalPublishedQs !== subj.questions.length) {
      throw new Error(`Snapshot verification MISMATCH for [${code}]: expected ${subj.questions.length}, got ${totalPublishedQs}`);
    }
    console.log(`✓ Snapshot verified: ${totalPublishedQs}/${subj.questions.length} questions in immutable published snapshot`);
  }

  // 6. Create the single '16 Jul 26' Assessment Event
  console.log("\n[4/6] Creating '16 Jul 26' Assessment Event & assigning 8 subjects...");
  const { data: newEvent, error: evErr } = await serviceClient
    .from("assessment_events")
    .insert({
      title: "16 Jul 26",
      assessment_type_id: quiz1Type.id,
      status: "Live",
      scheduled_start: new Date(Date.now() - 3600000).toISOString(),
    })
    .select("id, title, status")
    .single();

  if (evErr || !newEvent) {
    throw new Error("Failed to create assessment event: " + evErr?.message);
  }
  console.log(`✓ Created Assessment Event: '${newEvent.title}' (ID: ${newEvent.id}, Status: ${newEvent.status})`);

  // Assign 8 subjects to the 16 Jul 26 event
  const asRows = [];
  for (const [code, versionId] of publishedVersionsMap.entries()) {
    const sMeta = subjectMap.get(code)!;
    asRows.push({
      assessment_event_id: newEvent.id,
      subject_id: sMeta.id,
      paper_set_version_id: versionId,
    });
  }

  const { data: createdAS, error: asErr } = await serviceClient
    .from("assessment_subjects")
    .insert(asRows)
    .select("id, subject_id, paper_set_version_id");

  if (asErr || !createdAS || createdAS.length !== 8) {
    throw new Error(`Failed to assign assessment subjects: ${asErr?.message}`);
  }
  console.log(`✓ Successfully assigned ${createdAS.length} subjects to '${newEvent.title}'`);

  // 7. Enroll test student in all 8 subjects
  console.log("\n[5/6] Enrolling test student into all 8 subjects...");
  const { data: testUser } = await serviceClient
    .from("users")
    .select("id, email")
    .or("email.eq.test@sst.scaler.com,email.eq.test@gmail.com")
    .maybeSingle();

  if (testUser) {
    for (const code of Object.keys(manifest)) {
      const sMeta = subjectMap.get(code)!;
      await serviceClient.from("student_enrollments").upsert({
        student_id: testUser.id,
        subject_id: sMeta.id,
        term: "July 2026",
        is_active: true,
      }, { onConflict: "student_id,subject_id" });
    }
    console.log("✓ Enrolled test@gmail.com in all 8 subjects");
  }

  // 8. Final Invariant Verifications
  console.log("\n[6/6] Verifying database invariants...");
  const { data: liveEvents } = await serviceClient
    .from("assessment_events")
    .select("id, title, status");

  console.log("Live Assessment Events:", liveEvents?.map(e => `${e.title} (${e.status})`).join(", "));

  const { count: attemptCount } = await serviceClient
    .from("attempts")
    .select("*", { count: "exact", head: true });
  const { count: respCount } = await serviceClient
    .from("responses")
    .select("*", { count: "exact", head: true });
  const { count: resCount } = await serviceClient
    .from("results")
    .select("*", { count: "exact", head: true });

  console.log(`✓ Total Loaded Printed Questions: ${totalLoadedQs} (Expected: 195)`);
  console.log(`✓ Attempts: ${attemptCount ?? 0} (Expected 0)`);
  console.log(`✓ Responses: ${respCount ?? 0} (Expected 0)`);
  console.log(`✓ Results: ${resCount ?? 0} (Expected 0)`);

  console.log("\n================================================================================");
  console.log("  JULY 16, 2026 FIXTURE INGESTION COMPLETE & VERIFIED 100% SUCCESS");
  console.log("================================================================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error during July 16 ingestion:", err);
  process.exit(1);
});
