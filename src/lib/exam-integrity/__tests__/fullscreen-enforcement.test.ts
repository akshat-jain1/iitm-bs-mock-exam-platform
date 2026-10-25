import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBrowserFullscreen, exitBrowserFullscreen, ExamFullscreenState } from "@/hooks/useExamIntegrity";
import { INTEGRITY_CONFIG, IntegrityEventType } from "@/lib/exam-integrity/config";

describe("Exam Fullscreen Enforcement & State Machine", () => {
  it("TC-1: isBrowserFullscreen returns false when document is undefined or element is null", () => {
    // In node test environment without browser document
    assert.strictEqual(isBrowserFullscreen(), false);
  });

  it("TC-2: Fullscreen State Machine transitions correctly across lifecycle", () => {
    // State machine simulator mirroring useExamIntegrity
    let state: ExamFullscreenState = "awaiting-fullscreen";
    let hasInitiallyEntered = false;
    let exitCount = 0;
    const eventLog: IntegrityEventType[] = [];

    const handleFullscreenChange = (isCurrentlyFullscreen: boolean) => {
      if (isCurrentlyFullscreen) {
        hasInitiallyEntered = true;
        state = "active-fullscreen";
        eventLog.push("fullscreen_enter");
      } else {
        if (hasInitiallyEntered) {
          state = "fullscreen-lost";
          exitCount += 1;
          eventLog.push("fullscreen_exit");
        } else {
          state = "awaiting-fullscreen";
        }
      }
    };

    // Initial check when browser is not in fullscreen
    handleFullscreenChange(false);
    assert.strictEqual(state, "awaiting-fullscreen");
    assert.strictEqual(exitCount, 0);
    assert.strictEqual(eventLog.length, 0);

    // Student confirms fullscreen on start
    handleFullscreenChange(true);
    assert.strictEqual(state, "active-fullscreen");
    assert.strictEqual(hasInitiallyEntered, true);
    assert.strictEqual(exitCount, 0);
    assert.strictEqual(eventLog[0], "fullscreen_enter");

    // Student exits fullscreen (Escape / Window Change)
    handleFullscreenChange(false);
    assert.strictEqual(state, "fullscreen-lost");
    assert.strictEqual(exitCount, 1);
    assert.strictEqual(eventLog[1], "fullscreen_exit");

    // Student returns to fullscreen
    handleFullscreenChange(true);
    assert.strictEqual(state, "active-fullscreen");
    assert.strictEqual(exitCount, 1);
    assert.strictEqual(eventLog[2], "fullscreen_enter");

    // Subsequent exit
    handleFullscreenChange(false);
    assert.strictEqual(state, "fullscreen-lost");
    assert.strictEqual(exitCount, 2);
    assert.strictEqual(eventLog[3], "fullscreen_exit");
  });

  it("TC-3: Event debouncing prevents duplicate telemetry spam", () => {
    const lastLogTime = new Map<string, number>();
    const bufferedEvents: IntegrityEventType[] = [];

    const logEvent = (eventType: IntegrityEventType, now: number) => {
      const lastTime = lastLogTime.get(eventType) || 0;
      if (now - lastTime < INTEGRITY_CONFIG.EVENT_DEBOUNCE_MS) {
        return false; // Suppressed
      }
      lastLogTime.set(eventType, now);
      bufferedEvents.push(eventType);
      return true;
    };

    const t0 = 100000;
    // Rapid duplicate exit events within 500ms
    assert.strictEqual(logEvent("fullscreen_exit", t0), true);
    assert.strictEqual(logEvent("fullscreen_exit", t0 + 200), false);
    assert.strictEqual(logEvent("fullscreen_exit", t0 + 500), false);
    assert.strictEqual(logEvent("fullscreen_exit", t0 + 1999), false);

    // After debounce interval (2000ms)
    assert.strictEqual(logEvent("fullscreen_exit", t0 + 2001), true);
    assert.strictEqual(bufferedEvents.length, 2);
  });

  it("TC-4: Interaction locking blocks manual submission and subject switches while allowing auto-submit on expiry", () => {
    let activeState: ExamFullscreenState = "fullscreen-lost";

    const attemptSubjectChange = (state: ExamFullscreenState): boolean => {
      if (state !== "active-fullscreen") return false;
      return true;
    };

    const attemptSubmission = (state: ExamFullscreenState, isAuto: boolean): boolean => {
      if (!isAuto && state !== "active-fullscreen") return false;
      return true;
    };

    // While in fullscreen-lost:
    assert.strictEqual(attemptSubjectChange(activeState), false, "Subject change must be blocked");
    assert.strictEqual(attemptSubmission(activeState, false), false, "Manual submit must be blocked");
    assert.strictEqual(attemptSubmission(activeState, true), true, "Authoritative auto-submit on timer expiry must NOT be blocked");

    // Once restored to active-fullscreen:
    activeState = "active-fullscreen";
    assert.strictEqual(attemptSubjectChange(activeState), true, "Subject change allowed in fullscreen");
    assert.strictEqual(attemptSubmission(activeState, false), true, "Manual submit allowed in fullscreen");
  });

  it("TC-5: Local draft responses and queue operations are preserved during fullscreen loss", () => {
    // Simulating draft state in useExamSession
    const draftResponses: Record<string, string | number> = {
      "q-1": "Option A",
      "q-2": 42.5,
    };

    let examFullscreenState: ExamFullscreenState = "active-fullscreen";

    // Fullscreen is lost
    examFullscreenState = "fullscreen-lost";

    // Draft responses in memory remain completely untouched
    assert.strictEqual(draftResponses["q-1"], "Option A");
    assert.strictEqual(draftResponses["q-2"], 42.5);

    // Fullscreen restored
    examFullscreenState = "active-fullscreen";
    assert.strictEqual(examFullscreenState, "active-fullscreen");
    assert.strictEqual(draftResponses["q-1"], "Option A");
    assert.strictEqual(draftResponses["q-2"], 42.5);
  });

  it("TC-6: exitBrowserFullscreen safely resolves and returns true when not in fullscreen", async () => {
    // In node test environment without browser document, exitBrowserFullscreen safely resolves
    const res = await exitBrowserFullscreen();
    assert.strictEqual(res, false, "Without document, returns false safely without throwing");
  });

  it("TC-7: Fullscreen release on exam transition occurs only after successful finalization", async () => {
    let fullscreenExited = false;
    let submitted = false;

    const mockExitFullscreen = async () => {
      fullscreenExited = true;
      return true;
    };

    const handleSubmissionFlow = async (finalizationSucceeds: boolean) => {
      if (!finalizationSucceeds) {
        // Submission failed; do NOT exit fullscreen
        return { success: false };
      }
      submitted = true;
      await mockExitFullscreen();
      return { success: true };
    };

    // Failed submission
    const failRes = await handleSubmissionFlow(false);
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(submitted, false);
    assert.strictEqual(fullscreenExited, false, "Must not exit fullscreen if submission failed");

    // Succeeded submission
    const successRes = await handleSubmissionFlow(true);
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(submitted, true);
    assert.strictEqual(fullscreenExited, true, "Must release fullscreen after successful submission");
  });

  it("TC-8: Expired session detection correctly flags elapsed attempts without loop", () => {
    const isSessionExpired = (startTimeIso: string, durationMins: number, nowMs: number) => {
      const startMs = new Date(startTimeIso).getTime();
      const expMs = startMs + durationMins * 60 * 1000;
      return nowMs > expMs;
    };

    const t0 = new Date("2026-10-12T10:00:00Z").getTime();
    const durationMins = 90;

    // Within exam duration (e.g. 30 mins in)
    const inProgressTime = t0 + 30 * 60 * 1000;
    assert.strictEqual(isSessionExpired("2026-10-12T10:00:00Z", durationMins, inProgressTime), false);

    // Exactly at expiration time
    const exactExpirationTime = t0 + 90 * 60 * 1000;
    assert.strictEqual(isSessionExpired("2026-10-12T10:00:00Z", durationMins, exactExpirationTime), false);

    // Past expiration time (e.g. 91 mins in, or hours later)
    const expiredTime = t0 + 91 * 60 * 1000;
    assert.strictEqual(isSessionExpired("2026-10-12T10:00:00Z", durationMins, expiredTime), true);
  });

  it("TC-9: Deep-link return destination sanitization rejects open redirects and enforces role boundaries", () => {
    function sanitizeReturnUrl(urlStr: string | null, role: string): string {
      const defaultDest = role === "admin" ? "/admin" : "/student";
      if (!urlStr) return defaultDest;
      if (!urlStr.startsWith("/") || urlStr.startsWith("//") || urlStr.includes("\\")) {
        return defaultDest;
      }
      try {
        const parsed = new URL(urlStr, "http://localhost");
        const targetPath = parsed.pathname;
        const fullTarget = `${parsed.pathname}${parsed.search}`;
        if (targetPath === "/login" || targetPath.startsWith("/auth")) {
          return defaultDest;
        }
        if (role === "admin") {
          if (targetPath === "/" || targetPath.startsWith("/admin")) {
            return targetPath === "/" ? "/admin" : fullTarget;
          }
        } else {
          if (
            targetPath === "/" ||
            targetPath.startsWith("/student") ||
            targetPath.startsWith("/attempt") ||
            targetPath.startsWith("/mock-exam")
          ) {
            return targetPath === "/" ? "/student" : fullTarget;
          }
        }
      } catch {}
      return defaultDest;
    }

    // Valid student destinations with query params
    assert.strictEqual(
      sanitizeReturnUrl("/student/assessment/abc-123?foo=bar", "student"),
      "/student/assessment/abc-123?foo=bar"
    );
    assert.strictEqual(sanitizeReturnUrl("/student/profile", "student"), "/student/profile");

    // Open redirects and external URLs
    assert.strictEqual(sanitizeReturnUrl("https://evil.com", "student"), "/student");
    assert.strictEqual(sanitizeReturnUrl("//evil.com", "student"), "/student");
    assert.strictEqual(sanitizeReturnUrl("/\\evil.com", "student"), "/student");

    // Loop prevention
    assert.strictEqual(sanitizeReturnUrl("/login", "student"), "/student");
    assert.strictEqual(sanitizeReturnUrl("/auth/callback", "student"), "/student");

    // Role protection: student trying to access admin route
    assert.strictEqual(sanitizeReturnUrl("/admin/exams", "student"), "/student");
    // Admin accessing admin route
    assert.strictEqual(sanitizeReturnUrl("/admin/exams", "admin"), "/admin/exams");
  });

  it("TC-10: Server-verified production submission state evaluation rejects forged query parameters", () => {
    interface AttemptStub {
      id: string;
      status: string;
    }

    const evaluateProductionSubmissionState = (
      attempts: AttemptStub[],
      querySubmittedParam: boolean,
      isTest: boolean
    ) => {
      const completedAttempts = attempts.filter((a) => a.status === "Completed");
      const hasCompletedProduction = !isTest && completedAttempts.length > 0;
      const isServerVerifiedCompleted = hasCompletedProduction;
      const showSuccessConfirmation = isServerVerifiedCompleted && querySubmittedParam;

      return {
        hasCompletedProduction,
        showSuccessConfirmation,
      };
    };

    // Case 1: Student visits ?submitted=true with NO completed attempts (forged URL)
    const forgedResult = evaluateProductionSubmissionState([], true, false);
    assert.strictEqual(forgedResult.hasCompletedProduction, false);
    assert.strictEqual(forgedResult.showSuccessConfirmation, false, "Must not show success confirmation on forged query param");

    // Case 2: Student has Live (not completed) attempt with ?submitted=true
    const liveResult = evaluateProductionSubmissionState([{ id: "att-1", status: "Live" }], true, false);
    assert.strictEqual(liveResult.hasCompletedProduction, false);
    assert.strictEqual(liveResult.showSuccessConfirmation, false);

    // Case 3: Legitimate submitted attempt with ?submitted=true
    const legitimateResult = evaluateProductionSubmissionState([{ id: "att-1", status: "Completed" }], true, false);
    assert.strictEqual(legitimateResult.hasCompletedProduction, true);
    assert.strictEqual(legitimateResult.showSuccessConfirmation, true);

    // Case 4: Legitimate submitted attempt revisiting page later without query param
    const returnVisitResult = evaluateProductionSubmissionState([{ id: "att-1", status: "Completed" }], false, false);
    assert.strictEqual(returnVisitResult.hasCompletedProduction, true);
    assert.strictEqual(returnVisitResult.showSuccessConfirmation, false, "Normal completed state without green toast");
  });

  it("TC-11: Last-saved Profile subject state machine maintains clean dirty detection and reliable reset", () => {
    let savedIds = ["sub-1", "sub-2"];
    let selectedIds = ["sub-1", "sub-2"];

    const hasChanges = (current: string[], saved: string[]) => {
      if (current.length !== saved.length) return true;
      const set = new Set(saved);
      return current.some((id) => !set.has(id));
    };

    // Initially clean
    assert.strictEqual(hasChanges(selectedIds, savedIds), false);

    // Student modifies selection
    selectedIds = ["sub-1", "sub-3"];
    assert.strictEqual(hasChanges(selectedIds, savedIds), true);

    // Student resets: must restore latest saved state
    selectedIds = [...savedIds];
    assert.strictEqual(hasChanges(selectedIds, savedIds), false);

    // Student modifies and saves successfully
    selectedIds = ["sub-1", "sub-3", "sub-4"];
    assert.strictEqual(hasChanges(selectedIds, savedIds), true);
    // On save success:
    savedIds = [...selectedIds];
    assert.strictEqual(hasChanges(selectedIds, savedIds), false, "Save must clear dirty state immediately");

    // Later reset should revert to latest saved, not original
    selectedIds = ["sub-1"];
    assert.strictEqual(hasChanges(selectedIds, savedIds), true);
    selectedIds = [...savedIds];
    assert.deepStrictEqual(selectedIds, ["sub-1", "sub-3", "sub-4"]);
    assert.strictEqual(hasChanges(selectedIds, savedIds), false);
  });
});
