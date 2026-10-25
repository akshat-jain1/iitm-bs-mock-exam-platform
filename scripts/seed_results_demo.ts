import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";
import { clearResultsDemoData } from "./clear_results_demo";

if (fs.existsSync(".env")) {
  fs.readFileSync(".env", "utf8").split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function deterministicUuid(seed: string): string {
  const h = crypto.createHash("md5").update("RESULTS_DEMO:" + seed).digest("hex");
  return `${h.substring(0, 8)}-${h.substring(8, 12)}-4${h.substring(13, 16)}-a${h.substring(17, 20)}-${h.substring(20, 32)}`;
}

export async function seedResultsDemoData() {
  console.log("🌱 Seeding Results Demo development data...");

  // 1. Clean any existing demo data first to guarantee clean idempotent state
  await clearResultsDemoData();

  // 2. Fetch all 8 authoritative subjects
  const { data: subjects, error: subjErr } = await supabase
    .from("subjects")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (subjErr || !subjects || subjects.length < 8) {
    throw new Error(`Failed to load 8 authoritative subjects: ${subjErr?.message}`);
  }
  console.log(`Loaded ${subjects.length} subjects:`, subjects.map(s => s.name).join(", "));

  // 3. Fetch Assessment Types
  const { data: assessmentTypes, error: atErr } = await supabase
    .from("assessment_types")
    .select("id, name");

  if (atErr || !assessmentTypes) {
    throw new Error(`Failed to load assessment types: ${atErr?.message}`);
  }

  const quiz1Type = assessmentTypes.find(t => t.name === "Quiz 1");
  const endTermType = assessmentTypes.find(t => t.name === "End Term");

  if (!quiz1Type || !endTermType) {
    throw new Error("Missing Quiz 1 or End Term assessment types in database");
  }

  // 4. Create 18 Demo Students
  const demoStudents = [];
  for (let i = 1; i <= 18; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    const email = `demo.student${numStr}@example.test`;
    const name = `Demo Student ${numStr}`;

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: "DemoPassword123!",
      email_confirm: true,
      user_metadata: { full_name: name, role: "student" },
    });
    if (authErr || !authData?.user) {
      throw new Error(`Failed to create demo auth user ${email}: ${authErr?.message}`);
    }

    await supabase.from("users").upsert({
      id: authData.user.id,
      name,
      email,
      role: "student",
    });

    demoStudents.push({
      id: authData.user.id,
      name,
      email,
    });
  }
  console.log(`Created ${demoStudents.length} demo students via Auth Admin.`);

  // ============================================================================
  // EXAM 1: Results Demo — Quiz 1
  // ============================================================================
  const exam1Id = deterministicUuid("exam-results-demo-quiz-1");
  const { error: exam1Err } = await supabase.from("assessment_events").insert({
    id: exam1Id,
    title: "Results Demo — Quiz 1",
    assessment_type_id: quiz1Type.id,
    scheduled_start: "2026-09-10T09:00:00Z",
    status: "Completed",
  });
  if (exam1Err) throw new Error(`Failed to insert Exam 1: ${exam1Err.message}`);
  console.log("Created Assessment Event: Results Demo — Quiz 1");

  // Map each subject to its existing Quiz 1 paper set version (e.g. 16 Jul 26 set)
  const exam1Asubs = [];
  const subjectPsvMap1: Record<string, { psvId: string; maxMarks: number }> = {};

  for (const subj of subjects) {
    const { data: psvList } = await supabase
      .from("paper_set_versions")
      .select("id, title")
      .eq("subject_id", subj.id)
      .eq("assessment_type_id", quiz1Type.id)
      .limit(1);

    if (!psvList || psvList.length === 0) {
      throw new Error(`No Quiz 1 paper set version found for subject ${subj.name}`);
    }

    const psvId = psvList[0].id;
    const asubId = deterministicUuid(`exam1-asub-${subj.code}`);
    exam1Asubs.push({
      id: asubId,
      assessment_event_id: exam1Id,
      subject_id: subj.id,
      paper_set_version_id: psvId,
    });

    // Query max marks for this version
    const { data: qMarks } = await supabase
      .from("question_versions")
      .select(`
        marks,
        section_versions!inner(paper_set_version_id)
      `)
      .eq("section_versions.paper_set_version_id", psvId);

    const { data: gqMarks } = await supabase
      .from("question_versions")
      .select(`
        marks,
        group_versions!inner(section_versions!inner(paper_set_version_id))
      `)
      .eq("group_versions.section_versions.paper_set_version_id", psvId);

    const totalMarks =
      (qMarks || []).reduce((acc, q) => acc + Number(q.marks), 0) +
      (gqMarks || []).reduce((acc, q) => acc + Number(q.marks), 0);

    subjectPsvMap1[subj.id] = { psvId, maxMarks: totalMarks || 50 };
  }

  const { error: asub1Err } = await supabase.from("assessment_subjects").insert(exam1Asubs);
  if (asub1Err) throw new Error(`Failed to insert Exam 1 assessment subjects: ${asub1Err.message}`);
  console.log(`Configured all 8 subjects for Results Demo — Quiz 1.`);

  // Create attempts & results for Exam 1 with realistic variations and NA cells
  const exam1Attempts = [];
  const exam1Results = [];

  // Subject indices chosen per student (0 to 7) to guarantee realistic NA distribution
  const exam1StudentSubjectPlan: Record<number, number[]> = {
    1: [0, 1, 2, 3, 5, 6, 7],      // skips 4 (Maths 2)
    2: [0, 2, 3, 4, 6, 7],         // skips 1 (Eng 1), 5 (Python)
    3: [0, 1, 2, 3, 4, 5, 6, 7],   // all 8
    4: [0, 1, 3, 5],               // skips 2, 4, 6, 7
    5: [1, 2, 3, 4, 6],            // skips 0, 5, 7
    6: [0, 1, 3, 4, 5, 6, 7],      // skips 2 (Eng 2)
    7: [0, 1, 2, 5, 6],            // skips 3, 4, 7
    8: [0, 1, 2, 3, 4, 5, 6, 7],   // all 8
    9: [3, 4, 5, 6, 7],            // skips 0, 1, 2
    10: [0, 1, 2, 3, 6],           // skips 4, 5, 7
    11: [0, 2, 3, 4, 5, 7],        // skips 1, 6
    12: [1, 3, 5, 6],              // skips 0, 2, 4, 7
    13: [0, 1, 2, 3, 4, 5, 6, 7],  // all 8
    14: [0, 1, 4, 5, 6, 7],        // skips 2, 3
    15: [0, 1, 2, 3, 4, 5, 6, 7],  // all 8
    16: [1, 2, 3, 6, 7],           // skips 0, 4, 5
    17: [0, 3, 4, 5, 7],           // skips 1, 2, 6
    18: [0, 1, 2, 4, 5, 6],        // skips 3, 7
  };

  // Base score multiplier for each student to simulate varying performance levels
  const studentAbility = [
    0.88, 0.74, 0.94, 0.58, 0.65, 0.82, 0.71, 0.91, 0.77,
    0.69, 0.85, 0.52, 0.96, 0.79, 0.89, 0.63, 0.73, 0.81
  ];

  for (let sIdx = 1; sIdx <= 18; sIdx++) {
    const student = demoStudents[sIdx - 1];
    const plan = exam1StudentSubjectPlan[sIdx] || [0, 1, 2, 3, 4, 5, 6, 7];
    const baseMult = studentAbility[sIdx - 1];

    for (const subjIdx of plan) {
      const subj = subjects[subjIdx];
      const asub = exam1Asubs.find(a => a.subject_id === subj.id)!;
      const { psvId, maxMarks } = subjectPsvMap1[subj.id];

      // Add a slight jitter (-0.08 to +0.08) per subject
      const jitter = ((sIdx * 7 + subjIdx * 13) % 17 - 8) / 100;
      const pct = Math.min(0.98, Math.max(0.35, baseMult + jitter));
      const score = Math.round(pct * maxMarks * 2) / 2; // round to half mark

      const attemptId = deterministicUuid(`exam1-att-${student.id}-${subj.code}`);
      const startTime = new Date("2026-09-10T09:00:00Z");
      const endTime = new Date(startTime.getTime() + (45 + (sIdx * 3 + subjIdx * 5) % 65) * 60000);

      exam1Attempts.push({
        id: attemptId,
        student_id: student.id,
        assessment_subject_id: asub.id,
        paper_set_version_id: psvId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "Completed",
      });

      exam1Results.push({
        attempt_id: attemptId,
        score: score,
        status: "Evaluated",
        evaluated_at: endTime.toISOString(),
      });
    }
  }

  const { error: att1Err } = await supabase.from("attempts").insert(exam1Attempts);
  if (att1Err) throw new Error(`Failed to insert Exam 1 attempts: ${att1Err.message}`);

  const { error: res1Err } = await supabase.from("results").insert(exam1Results);
  if (res1Err) throw new Error(`Failed to insert Exam 1 results: ${res1Err.message}`);
  console.log(`Inserted ${exam1Attempts.length} attempts and results for Results Demo — Quiz 1.`);

  // ============================================================================
  // EXAM 2: Results Demo — End Term
  // ============================================================================
  const exam2Id = deterministicUuid("exam-results-demo-end-term");
  const { error: exam2Err } = await supabase.from("assessment_events").insert({
    id: exam2Id,
    title: "Results Demo — End Term",
    assessment_type_id: endTermType.id,
    scheduled_start: "2026-09-25T09:00:00Z",
    status: "Completed",
  });
  if (exam2Err) throw new Error(`Failed to insert Exam 2: ${exam2Err.message}`);
  console.log("Created Assessment Event: Results Demo — End Term");

  // Create 8 demo End Term paper set versions (each total 100 marks)
  const exam2Asubs = [];
  const subjectPsvMap2: Record<string, { psvId: string; maxMarks: number }> = {};

  for (const subj of subjects) {
    const psvId = deterministicUuid(`endterm-psv-${subj.code}`);
    const { error: psvErr } = await supabase.from("paper_set_versions").insert({
      id: psvId,
      subject_id: subj.id,
      assessment_type_id: endTermType.id,
      title: `Results Demo End Term — ${subj.name}`,
    });
    if (psvErr) throw new Error(`Failed to insert demo End Term paper version for ${subj.name}: ${psvErr.message}`);

    // Add 1 section version
    const secId = deterministicUuid(`endterm-sec-${subj.code}`);
    const { error: secErr } = await supabase.from("section_versions").insert({
      id: secId,
      paper_set_version_id: psvId,
      title: "Comprehensive Section",
    });
    if (secErr) throw new Error(`Failed to insert demo section for ${subj.name}: ${secErr.message}`);

    // Add 10 questions of 10 marks each = 100 max marks
    const questions = [];
    for (let q = 1; q <= 10; q++) {
      questions.push({
        id: deterministicUuid(`endterm-q-${subj.code}-${q}`),
        section_version_id: secId,
        type: "MCQ",
        text: `Demo End Term Question ${q} for ${subj.name}`,
        marks: 10.0,
      });
    }
    const { error: qErr } = await supabase.from("question_versions").insert(questions);
    if (qErr) throw new Error(`Failed to insert demo questions for ${subj.name}: ${qErr.message}`);

    const asubId = deterministicUuid(`exam2-asub-${subj.code}`);
    exam2Asubs.push({
      id: asubId,
      assessment_event_id: exam2Id,
      subject_id: subj.id,
      paper_set_version_id: psvId,
    });

    subjectPsvMap2[subj.id] = { psvId, maxMarks: 100 };
  }

  const { error: asub2Err } = await supabase.from("assessment_subjects").insert(exam2Asubs);
  if (asub2Err) throw new Error(`Failed to insert Exam 2 assessment subjects: ${asub2Err.message}`);
  console.log(`Configured all 8 subjects for Results Demo — End Term (Max Marks: 100 each).`);

  // Create attempts & results for Exam 2 with a different distribution
  const exam2Attempts = [];
  const exam2Results = [];

  // End term subject plan (16 students participate in End Term)
  const exam2StudentSubjectPlan: Record<number, number[]> = {
    1: [0, 1, 2, 3, 4, 5, 6, 7],   // all 8
    2: [0, 1, 3, 4, 6, 7],         // skips 2, 5
    3: [0, 2, 3, 4, 5, 6, 7],      // skips 1
    4: [0, 3, 5, 6],               // skips 1, 2, 4, 7
    5: [0, 1, 2, 4, 5, 6],         // skips 3, 7
    6: [1, 2, 3, 4, 5, 6, 7],      // skips 0
    7: [0, 1, 2, 3, 5, 6],         // skips 4, 7
    8: [0, 1, 2, 3, 4, 5, 6, 7],   // all 8
    9: [2, 3, 4, 5, 6, 7],         // skips 0, 1
    10: [0, 1, 3, 5, 6, 7],        // skips 2, 4
    11: [0, 1, 2, 3, 4, 6],        // skips 5, 7
    12: [0, 2, 3, 5],              // skips 1, 4, 6, 7
    13: [0, 1, 2, 3, 4, 5, 6, 7],  // all 8
    14: [1, 2, 3, 4, 5, 7],        // skips 0, 6
    15: [0, 1, 3, 4, 5, 6, 7],     // skips 2
    16: [0, 1, 2, 3, 6, 7],        // skips 4, 5
  };

  const endTermAbility = [
    0.91, 0.78, 0.88, 0.62, 0.71, 0.84, 0.75, 0.95,
    0.80, 0.68, 0.86, 0.55, 0.93, 0.76, 0.87, 0.69
  ];

  for (let sIdx = 1; sIdx <= 16; sIdx++) {
    const student = demoStudents[sIdx - 1];
    const plan = exam2StudentSubjectPlan[sIdx] || [0, 1, 2, 3, 4, 5, 6, 7];
    const baseMult = endTermAbility[sIdx - 1];

    for (const subjIdx of plan) {
      const subj = subjects[subjIdx];
      const asub = exam2Asubs.find(a => a.subject_id === subj.id)!;
      const { psvId, maxMarks } = subjectPsvMap2[subj.id];

      const jitter = ((sIdx * 11 + subjIdx * 19) % 21 - 10) / 100;
      const pct = Math.min(0.99, Math.max(0.40, baseMult + jitter));
      const score = Math.round(pct * maxMarks);

      const attemptId = deterministicUuid(`exam2-att-${student.id}-${subj.code}`);
      const startTime = new Date("2026-09-25T09:00:00Z");
      const endTime = new Date(startTime.getTime() + (60 + (sIdx * 4 + subjIdx * 7) % 80) * 60000);

      exam2Attempts.push({
        id: attemptId,
        student_id: student.id,
        assessment_subject_id: asub.id,
        paper_set_version_id: psvId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "Completed",
      });

      exam2Results.push({
        attempt_id: attemptId,
        score: score,
        status: "Evaluated",
        evaluated_at: endTime.toISOString(),
      });
    }
  }

  const { error: att2Err } = await supabase.from("attempts").insert(exam2Attempts);
  if (att2Err) throw new Error(`Failed to insert Exam 2 attempts: ${att2Err.message}`);

  const { error: res2Err } = await supabase.from("results").insert(exam2Results);
  if (res2Err) throw new Error(`Failed to insert Exam 2 results: ${res2Err.message}`);
  console.log(`Inserted ${exam2Attempts.length} attempts and results for Results Demo — End Term.`);

  console.log("🎉 Seeding completed successfully!");
  console.log(`  - Exam 1: "Results Demo — Quiz 1" (8 subjects, ${exam1Attempts.length} recorded submissions, 18 students)`);
  console.log(`  - Exam 2: "Results Demo — End Term" (8 subjects, ${exam2Attempts.length} recorded submissions, 16 students)`);
}

if (process.argv[1]?.endsWith("seed_results_demo.ts")) {
  seedResultsDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
