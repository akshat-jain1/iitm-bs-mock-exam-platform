import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHmac } from "crypto";
import { IntegrityEventType } from "@/lib/exam-integrity/config";
import { SAVE_GRACE_MS } from "@/lib/exam/constants";

const VALID_EVENTS: IntegrityEventType[] = [
  "fullscreen_exit",
  "fullscreen_enter",
  "visibility_lost",
  "visibility_restored",
  "window_blur",
  "window_focus",
  "copy_attempt",
  "paste_attempt",
  "cut_attempt",
  "context_menu_attempt",
  "restricted_shortcut_attempt",
];

interface IncomingIntegrityEvent {
  attemptId: string;
  eventType: IntegrityEventType;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (!claims?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = claims.sub as string;

    const secret = process.env.EXAM_SESSION_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server configuration error: EXAM_SESSION_SECRET is not set" },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const events = (body as { events?: unknown }).events;
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "Events array is required" }, { status: 400 });
    }

    if (events.length > 50) {
      return NextResponse.json(
        { error: "Batch size exceeds maximum limit of 50 events" },
        { status: 400 }
      );
    }

    // Read all exam session cookies
    const allCookies = request.cookies.getAll();
    const sessionCookies = allCookies.filter((c) => c.name.startsWith("exam_session_"));
    if (sessionCookies.length === 0) {
      return NextResponse.json(
        { error: "No active exam session cookie found" },
        { status: 403 }
      );
    }

    // Cache valid sessions for this user: map of attemptId -> sessionData
    const verifiedSessionsByAttempt = new Map<
      string,
      {
        assessmentId: string;
        studentId: string;
        attempts: string;
        startMs?: number;
        durationMs?: number;
      }
    >();

    for (const cookie of sessionCookies) {
      try {
        const { payload, signature } = JSON.parse(cookie.value);
        const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
        if (signature !== expectedSig) continue;

        const sessionData = JSON.parse(payload);
        if (sessionData.studentId !== userId) continue;

        const validAttemptIds: string[] = sessionData.attempts
          ? sessionData.attempts.split(",")
          : [];

        for (const attId of validAttemptIds) {
          verifiedSessionsByAttempt.set(attId, sessionData);
        }
      } catch {
        continue;
      }
    }

    if (verifiedSessionsByAttempt.size === 0) {
      return NextResponse.json(
        { error: "No verified exam sessions for current user" },
        { status: 403 }
      );
    }

    const rowsToInsert: Array<{
      attempt_id: string;
      student_id: string;
      event_type: string;
      metadata: Record<string, unknown>;
    }> = [];

    const now = Date.now();

    for (const rawEvent of events) {
      if (!rawEvent || typeof rawEvent !== "object") {
        return NextResponse.json({ error: "Malformed event object" }, { status: 400 });
      }

      const ev = rawEvent as IncomingIntegrityEvent;

      if (!ev.attemptId || typeof ev.attemptId !== "string") {
        return NextResponse.json({ error: "Missing or invalid attemptId" }, { status: 400 });
      }

      if (!VALID_EVENTS.includes(ev.eventType)) {
        return NextResponse.json(
          { error: `Invalid event type: ${ev.eventType}` },
          { status: 400 }
        );
      }

      const sessionData = verifiedSessionsByAttempt.get(ev.attemptId);
      if (!sessionData) {
        return NextResponse.json(
          { error: `Attempt ${ev.attemptId} not authorized in session` },
          { status: 403 }
        );
      }

      // Timing / Expiry check with SAVE_GRACE_MS (30s grace window)
      if (
        typeof sessionData.startMs === "number" &&
        typeof sessionData.durationMs === "number"
      ) {
        if (now - sessionData.startMs >= sessionData.durationMs + SAVE_GRACE_MS) {
          return NextResponse.json(
            { error: "Exam session has expired" },
            { status: 403 }
          );
        }
      } else {
        // Fallback for legacy cookie
        const validAttemptIds = sessionData.attempts.split(",");
        const { data: authorizedAttempts } = await supabase
          .from("attempts")
          .select("id, start_time, assessment_subjects!inner(assessment_event_id)")
          .in("id", validAttemptIds)
          .eq("student_id", userId)
          .eq("status", "Live")
          .eq("assessment_subjects.assessment_event_id", sessionData.assessmentId);

        if (!authorizedAttempts || authorizedAttempts.length === 0) {
          return NextResponse.json(
            { error: "No authorized live attempts found" },
            { status: 403 }
          );
        }

        const subjectCount = authorizedAttempts.length;
        const startTimes = authorizedAttempts.map((a) =>
          new Date(a.start_time).getTime()
        );
        const authoritativeStartTimeMs = Math.min(...startTimes);
        const totalDurationMins = Math.max(90, subjectCount * 60);
        const totalDurationMs = totalDurationMins * 60 * 1000;

        if (now - authoritativeStartTimeMs >= totalDurationMs + SAVE_GRACE_MS) {
          return NextResponse.json(
            { error: "Exam session has expired" },
            { status: 403 }
          );
        }
      }

      const metadata = ev.metadata || {};
      if (JSON.stringify(metadata).length > 4096) {
        return NextResponse.json(
          { error: "Event metadata exceeds 4096 byte limit" },
          { status: 400 }
        );
      }

      rowsToInsert.push({
        attempt_id: ev.attemptId,
        student_id: userId,
        event_type: ev.eventType,
        metadata,
      });
    }

    // Insert all rows in ONE insert
    const { error: insertError } = await supabase
      .from("exam_integrity_events")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("Batch integrity event insertion failed:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, inserted: rowsToInsert.length });
  } catch (err: unknown) {
    console.error("Integrity API route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
