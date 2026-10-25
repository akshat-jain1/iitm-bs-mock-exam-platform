import { createClient } from "@supabase/supabase-js";
import fs from "fs";

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

export async function clearResultsDemoData() {
  console.log("🧹 Starting cleanup of Results Demo development data...");

  // 1. Identify demo users
  const { data: demoUsers } = await supabase
    .from("users")
    .select("id, email")
    .like("email", "%@example.test");

  const demoUserIds = (demoUsers || []).map((u) => u.id);
  console.log(`Found ${demoUserIds.length} demo users to clean.`);

  // 2. Identify demo assessment events
  const { data: demoEvents } = await supabase
    .from("assessment_events")
    .select("id, title")
    .like("title", "Results Demo — %");

  const demoEventIds = (demoEvents || []).map((e) => e.id);
  console.log(`Found ${demoEventIds.length} demo assessment events to clean.`);

  // 3. Find demo assessment subjects
  let demoAsubIds: string[] = [];
  if (demoEventIds.length > 0) {
    const { data: demoAsubs } = await supabase
      .from("assessment_subjects")
      .select("id")
      .in("assessment_event_id", demoEventIds);
    demoAsubIds = (demoAsubs || []).map((s) => s.id);
  }

  // 4. Delete demo attempts (which cascade deletes results and responses)
  if (demoUserIds.length > 0 || demoAsubIds.length > 0) {
    if (demoUserIds.length > 0 && demoAsubIds.length > 0) {
      // Delete attempts matching either demo users or demo assessment subjects
      await supabase.from("attempts").delete().in("student_id", demoUserIds);
      await supabase.from("attempts").delete().in("assessment_subject_id", demoAsubIds);
    } else if (demoUserIds.length > 0) {
      await supabase.from("attempts").delete().in("student_id", demoUserIds);
    } else if (demoAsubIds.length > 0) {
      await supabase.from("attempts").delete().in("assessment_subject_id", demoAsubIds);
    }
    console.log("Deleted demo attempts and cascaded results.");
  }

  // 5. Delete demo assessment subjects and events
  if (demoEventIds.length > 0) {
    const { error: eventErr } = await supabase
      .from("assessment_events")
      .delete()
      .in("id", demoEventIds);
    if (eventErr) {
      console.error("Error deleting demo events:", eventErr.message);
    } else {
      console.log(`Deleted ${demoEventIds.length} demo events.`);
    }
  }

  // 6. Delete demo End Term paper set versions (and cascaded sections/questions) via RPC
  const { error: rpcErr } = await supabase.rpc("delete_results_demo_paper_versions");
  if (rpcErr) {
    console.error("Error calling delete_results_demo_paper_versions:", rpcErr.message);
  } else {
    console.log("Deleted demo End Term paper versions and questions via RPC.");
  }

  // 7. Delete demo users via Auth Admin (cascades to public.users)
  if (demoUserIds.length > 0) {
    for (const uid of demoUserIds) {
      await supabase.auth.admin.deleteUser(uid);
    }
    console.log(`Deleted ${demoUserIds.length} demo auth users.`);
  }

  console.log("✅ Results Demo cleanup completed successfully. Real data was untouched.");
}

if (process.argv[1]?.endsWith("clear_results_demo.ts")) {
  clearResultsDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Cleanup failed:", err);
      process.exit(1);
    });
}
