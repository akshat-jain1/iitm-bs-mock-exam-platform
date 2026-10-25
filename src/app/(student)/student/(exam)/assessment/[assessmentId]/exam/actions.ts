"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { isAllowedScalerEmail } from "@/lib/auth/config";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import {
  getOrLoadPaperStructures,
  buildExamFromStructure,
  collectStoragePathsFromStructures,
  signPaperStoragePaths,
  applySignedUrlsToExam,
} from "@/lib/exam/paper-cache";
import type { Exam } from "@/lib/types/exam";

export interface LoadSubjectPaperResult {
  success: boolean;
  message?: string;
  exam?: Exam;
}

export async function loadUnselectedSubjectPaperAction(
  assessmentId: string,
  assessmentSubjectId: string
): Promise<LoadSubjectPaperResult> {
  const user = await getCachedUser();
  if (!user || !user.email) {
    return { success: false, message: "Unauthorized: Please log in." };
  }

  if (!isAllowedScalerEmail(user.email)) {
    return { success: false, message: "Forbidden: Unauthorized email domain." };
  }

  // Verify HMAC-signed exam session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(`exam_session_${assessmentId}`)?.value;
  if (!sessionCookie) {
    return { success: false, message: "Forbidden: Missing exam session." };
  }

  const secret = process.env.EXAM_SESSION_SECRET;
  if (!secret) {
    return { success: false, message: "Server configuration error: missing session secret." };
  }

  let selectedAttemptIds: string[] = [];
  try {
    const { payload, signature } = JSON.parse(sessionCookie);
    const expectedSignature = createHmac("sha256", secret).update(payload).digest("hex");
    if (signature !== expectedSignature) {
      return { success: false, message: "Forbidden: Invalid session signature." };
    }
    const parsedPayload = JSON.parse(payload);
    if (parsedPayload.studentId !== user.id || parsedPayload.assessmentId !== assessmentId) {
      return { success: false, message: "Forbidden: Session token binding mismatch." };
    }
    selectedAttemptIds = parsedPayload.attempts.split(",").filter(Boolean);
  } catch {
    return { success: false, message: "Forbidden: Malformed exam session cookie." };
  }

  if (selectedAttemptIds.length === 0) {
    return { success: false, message: "Forbidden: No attempts registered in session." };
  }

  const supabase = await createClient();
  const serviceClient = getServiceClientOrNull() || supabase;

  // Verify that the assessment subject actually belongs to this assessment event
  const { data: asData, error: asError } = await serviceClient
    .from("assessment_subjects")
    .select("id, paper_set_version_id, assessment_event_id, subjects(name, code), assessment_events(assignment_type, test_duration_mins)")
    .eq("id", assessmentSubjectId)
    .eq("assessment_event_id", assessmentId)
    .single();

  if (asError || !asData || !asData.paper_set_version_id) {
    return { success: false, message: "Subject not found in this assessment." };
  }

  // Verify the exam is not expired based on attempts
  const { data: attempts } = await supabase
    .from("attempts")
    .select("start_time")
    .eq("student_id", user.id)
    .in("id", selectedAttemptIds);

  if (!attempts || attempts.length === 0) {
    return { success: false, message: "No active attempts found." };
  }

  const startTimes = attempts.map((a) => new Date(a.start_time).getTime());
  const authoritativeStartTimeMs = Math.min(...startTimes);
  const selectedSubjectCount = attempts.length;

  const eventObj = Array.isArray(asData.assessment_events) ? asData.assessment_events[0] : asData.assessment_events;
  const isTest = eventObj?.assignment_type === "TEST";
  const testDurationMins = eventObj?.test_duration_mins;
  const totalDurationMins = (isTest && testDurationMins && testDurationMins > 0)
    ? testDurationMins
    : Math.max(90, selectedSubjectCount * 60);
  const expirationTimeMs = authoritativeStartTimeMs + totalDurationMins * 60 * 1000;

  if (Date.now() > expirationTimeMs) {
    return { success: false, message: "Exam session has expired." };
  }

  // Load paper structure using framework cache
  const paperMap = await getOrLoadPaperStructures([asData.paper_set_version_id], serviceClient);
  const paperStructure = paperMap.get(asData.paper_set_version_id);
  if (!paperStructure) {
    return { success: false, message: "Failed to load paper structure." };
  }

  // Calculate remaining seconds for signed URLs
  const remainingSeconds = Math.max(300, Math.floor((expirationTimeMs - Date.now()) / 1000));

  // Collect and sign storage paths for this paper only
  const storagePaths = collectStoragePathsFromStructures([paperStructure]);
  const signedUrlMap = await signPaperStoragePaths(storagePaths, serviceClient, remainingSeconds);

  // Build exam structure and attach signed URLs
  const exam = buildExamFromStructure(paperStructure, user, totalDurationMins * 60);
  applySignedUrlsToExam(exam, signedUrlMap);

  return {
    success: true,
    exam,
  };
}
