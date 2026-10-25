"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  INTEGRITY_CONFIG,
  IntegrityEventType,
} from "@/lib/exam-integrity/config";

export type ExamFullscreenState = "awaiting-fullscreen" | "active-fullscreen" | "fullscreen-lost";

export function isBrowserFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
      (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement ||
      (document as unknown as { msFullscreenElement?: Element }).msFullscreenElement
  );
}

export async function requestBrowserFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return isBrowserFullscreen();
    } else if ("webkitRequestFullscreen" in el) {
      await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      return isBrowserFullscreen();
    } else if ("msRequestFullscreen" in el) {
      await (el as unknown as { msRequestFullscreen: () => Promise<void> }).msRequestFullscreen();
      return isBrowserFullscreen();
    }
    return false;
  } catch (err) {
    console.warn("Fullscreen request denied or unsupported:", err);
    return false;
  }
}

export async function exitBrowserFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    if (!isBrowserFullscreen()) return true;
    const doc = document as unknown as {
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
      mozCancelFullScreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
    };
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      await doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }
    return !isBrowserFullscreen();
  } catch (err) {
    console.warn("Fullscreen exit failed or unsupported:", err);
    return false;
  }
}

interface UseExamIntegrityOptions {
  attemptId: string | null;
  isEnabled?: boolean;
}

export interface UseExamIntegrityReturn {
  isFullscreen: boolean;
  fullscreenState: ExamFullscreenState;
  fullscreenExitCount: number;
  requestFullscreen: () => Promise<boolean>;
  isWindowFocused: boolean;
  windowLeftWarning: boolean;
  dismissWindowLeftWarning: () => void;
  notification: string | null;
  dismissNotification: () => void;
  integrityAcknowledged: boolean;
  hasCompletedInitialNotice: boolean;
  acknowledgeAndEnterFullscreen: () => Promise<boolean>;
  isNoticeDismissed: boolean;
  dismissNotice: () => void;
  flushIntegrityEvents: (drainAll?: boolean) => Promise<void>;
}

export function useExamIntegrity({
  attemptId,
  isEnabled = true,
}: UseExamIntegrityOptions): UseExamIntegrityReturn {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fullscreenState, setFullscreenState] = useState<ExamFullscreenState>("awaiting-fullscreen");
  const [fullscreenExitCount, setFullscreenExitCount] = useState<number>(0);
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);
  const [windowLeftWarning, setWindowLeftWarning] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [integrityAcknowledged, setIntegrityAcknowledged] = useState<boolean>(false);
  const [hasCompletedInitialNotice, setHasCompletedInitialNotice] = useState<boolean>(false);

  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const windowLeftTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLogTimeRef = useRef<Map<string, number>>(new Map());
  const hasInitiallyEnteredFullscreenRef = useRef<boolean>(false);
  const fullscreenStateRef = useRef<ExamFullscreenState>("awaiting-fullscreen");
  const integrityAcknowledgedRef = useRef<boolean>(false);
  const eventBufferRef = useRef<Array<{ attemptId: string; eventType: IntegrityEventType; metadata?: Record<string, unknown> }>>([]);
  const isFlushingRef = useRef<boolean>(false);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const MAX_INTEGRITY_BUFFER_SIZE = 500;

  // Helper to show temporary toast notification
  const showNotification = useCallback((message: string, durationMs = 3000) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification(message);
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
    }, durationMs);
  }, []);

  // Helper to dismiss notification
  const dismissNotification = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification(null);
  }, []);

  // Flush buffered integrity events
  const flushIntegrityEvents = useCallback(async (drainAll = false): Promise<void> => {
    // If a flush is already in flight, await it first
    while (inFlightPromiseRef.current) {
      try {
        await inFlightPromiseRef.current;
      } catch {
        // ignore in-flight error
      }
      // If this was not a drain-all call, awaiting the in-flight flush is sufficient
      if (!drainAll) {
        return;
      }
    }

    if (isFlushingRef.current) return;
    if (eventBufferRef.current.length === 0) return;

    isFlushingRef.current = true;

    const executeFlush = async () => {
      try {
        const maxBatches = drainAll ? 10 : 1;
        let batchCount = 0;

        while (eventBufferRef.current.length > 0 && batchCount < maxBatches) {
          batchCount++;
          const batch = eventBufferRef.current.slice(0, 50);

          try {
            const res = await fetch("/api/exam/integrity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events: batch }),
              keepalive: true,
            });

            const isTransientError = res.status === 408 || res.status === 429 || res.status >= 500;

            if (res.ok) {
              // 2xx success: remove sent events and reset failure counter
              eventBufferRef.current = eventBufferRef.current.slice(batch.length);
              consecutiveFailuresRef.current = 0;
            } else if (!isTransientError && res.status >= 400 && res.status < 500) {
              // permanent 4xx: drop doomed events and reset failure counter
              console.warn(`Integrity batch rejected with ${res.status}, dropping.`);
              eventBufferRef.current = eventBufferRef.current.slice(batch.length);
              consecutiveFailuresRef.current = 0;
            } else {
              // 5xx, 408, 429: transient server/rate-limit error
              consecutiveFailuresRef.current += 1;
              if (consecutiveFailuresRef.current >= 3) {
                console.warn(`Integrity batch failed 3 consecutive times with ${res.status}, dropping batch.`);
                eventBufferRef.current = eventBufferRef.current.slice(batch.length);
                consecutiveFailuresRef.current = 0;
              } else {
                console.warn(`Integrity batch failed with ${res.status}, keeping in buffer (failure count: ${consecutiveFailuresRef.current}).`);
                break;
              }
            }
          } catch (err) {
            // Network failure
            consecutiveFailuresRef.current += 1;
            if (consecutiveFailuresRef.current >= 3) {
              console.warn("Integrity batch failed 3 consecutive times with network error, dropping batch.");
              eventBufferRef.current = eventBufferRef.current.slice(batch.length);
              consecutiveFailuresRef.current = 0;
            } else {
              console.warn(`Failed to flush integrity events (network error), keeping in buffer (failure count: ${consecutiveFailuresRef.current}):`, err);
              break;
            }
          }
        }
      } finally {
        isFlushingRef.current = false;
        inFlightPromiseRef.current = null;
      }
    };

    try {
      const promise = executeFlush();
      inFlightPromiseRef.current = promise;
      return promise;
    } catch (err) {
      isFlushingRef.current = false;
      inFlightPromiseRef.current = null;
      throw err;
    }
  }, []);

  // Periodic flush every ~10s
  useEffect(() => {
    if (!isEnabled) return;
    const interval = setInterval(() => {
      flushIntegrityEvents();
    }, 10000);
    return () => clearInterval(interval);
  }, [isEnabled, flushIntegrityEvents]);

  // Flush on pagehide / unload
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return;
    const handlePageHide = () => {
      flushIntegrityEvents();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [isEnabled, flushIntegrityEvents]);

  // Central debounced event logger
  const logEvent = useCallback(
    (eventType: IntegrityEventType, metadata?: Record<string, unknown>) => {
      if (!isEnabled || !attemptId || attemptId.startsWith("unselected-")) {
        return;
      }

      const now = Date.now();
      const lastTime = lastLogTimeRef.current.get(eventType) || 0;
      if (now - lastTime < INTEGRITY_CONFIG.EVENT_DEBOUNCE_MS) {
        return; // Suppress duplicate spam
      }

      // Suppress redundant blur/visibility duplicates within 1500ms
      if (eventType === "window_blur") {
        const visLostTime = lastLogTimeRef.current.get("visibility_lost") || 0;
        if (now - visLostTime < 1500) return;
      }
      if (eventType === "visibility_lost") {
        const blurTime = lastLogTimeRef.current.get("window_blur") || 0;
        if (now - blurTime < 1500) return;
      }
      if (eventType === "window_focus") {
        const visRestoredTime = lastLogTimeRef.current.get("visibility_restored") || 0;
        if (now - visRestoredTime < 1500) return;
      }
      if (eventType === "visibility_restored") {
        const focusTime = lastLogTimeRef.current.get("window_focus") || 0;
        if (now - focusTime < 1500) return;
      }

      lastLogTimeRef.current.set(eventType, now);

      // Cap buffer size
      if (eventBufferRef.current.length >= MAX_INTEGRITY_BUFFER_SIZE) {
        eventBufferRef.current.shift();
      }

      // Buffer event in memory
      eventBufferRef.current.push({
        attemptId,
        eventType,
        metadata,
      });

      if (eventBufferRef.current.length >= 50) {
        flushIntegrityEvents();
      }
    },
    [isEnabled, attemptId, flushIntegrityEvents]
  );

  // Request browser fullscreen
  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === "undefined") return false;
    try {
      const entered = await requestBrowserFullscreen();
      const confirmed = entered || isBrowserFullscreen();
      if (confirmed) {
        setIsFullscreen(true);
        hasInitiallyEnteredFullscreenRef.current = true;
        fullscreenStateRef.current = "active-fullscreen";
        setFullscreenState("active-fullscreen");
        setHasCompletedInitialNotice(true);
        integrityAcknowledgedRef.current = true;
        setIntegrityAcknowledged(true);
        return true;
      } else {
        showNotification("Fullscreen mode could not be activated.", 3000);
        return false;
      }
    } catch (err) {
      console.warn("Fullscreen request denied or unsupported:", err);
      showNotification("Fullscreen mode could not be activated.", 3000);
      return false;
    }
  }, [showNotification]);

  // Combined action: acknowledge notice AND request fullscreen
  const acknowledgeAndEnterFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === "undefined") return false;

    const isAlreadyFullscreen = isBrowserFullscreen();
    let entered = false;
    if (isAlreadyFullscreen) {
      entered = true;
    } else {
      entered = await requestFullscreen();
    }

    if (entered) {
      integrityAcknowledgedRef.current = true;
      setIntegrityAcknowledged(true);
      setHasCompletedInitialNotice(true);
      fullscreenStateRef.current = "active-fullscreen";
      setFullscreenState("active-fullscreen");
      return true;
    }

    return false;
  }, [requestFullscreen]);

  // Fullscreen change detection
  useEffect(() => {
    if (!isEnabled || typeof document === "undefined") return;

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = isBrowserFullscreen();

      setIsFullscreen(isCurrentlyFullscreen);

      if (isCurrentlyFullscreen) {
        hasInitiallyEnteredFullscreenRef.current = true;
        fullscreenStateRef.current = "active-fullscreen";
        setFullscreenState("active-fullscreen");
        logEvent("fullscreen_enter");
        if (integrityAcknowledgedRef.current) {
          setHasCompletedInitialNotice(true);
        }
      } else {
        // Only count as an exit if student had entered fullscreen at least once
        if (hasInitiallyEnteredFullscreenRef.current) {
          fullscreenStateRef.current = "fullscreen-lost";
          setFullscreenState("fullscreen-lost");
          setFullscreenExitCount((prev) => prev + 1);
          logEvent("fullscreen_exit");
        } else {
          fullscreenStateRef.current = "awaiting-fullscreen";
          setFullscreenState("awaiting-fullscreen");
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    // Initial check
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [isEnabled, logEvent]);

  // Visibility and focus monitoring
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined" || typeof document === "undefined") return;

    const triggerWindowLeftWarning = () => {
      setWindowLeftWarning(true);
      if (windowLeftTimerRef.current) {
        clearTimeout(windowLeftTimerRef.current);
      }
      windowLeftTimerRef.current = setTimeout(() => {
        setWindowLeftWarning(false);
      }, 7000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setIsWindowFocused(false);
        logEvent("visibility_lost");
        flushIntegrityEvents();
      } else if (document.visibilityState === "visible") {
        setIsWindowFocused(true);
        logEvent("visibility_restored");
        triggerWindowLeftWarning();
      }
    };

    const handleBlur = () => {
      setIsWindowFocused(false);
      logEvent("window_blur");
    };

    const handleFocus = () => {
      setIsWindowFocused(true);
      logEvent("window_focus");
      triggerWindowLeftWarning();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (windowLeftTimerRef.current) {
        clearTimeout(windowLeftTimerRef.current);
      }
    };
  }, [isEnabled, logEvent, flushIntegrityEvents]);

  // Copy / Paste / Cut and Restricted Shortcut Restrictions
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier) {
        const key = e.key.toLowerCase();

        // Copy, Paste, Cut
        if (key === "c") {
          e.preventDefault();
          showNotification("Copying is disabled during the exam.");
          logEvent("copy_attempt");
          return;
        }
        if (key === "v") {
          e.preventDefault();
          showNotification("Pasting is disabled during the exam.");
          logEvent("paste_attempt");
          return;
        }
        if (key === "x") {
          e.preventDefault();
          showNotification("Cutting is disabled during the exam.");
          logEvent("cut_attempt");
          return;
        }

        // Common exit shortcuts (Ctrl/Cmd+T, W, N, Shift+T, L)
        if (key === "t" || key === "w" || key === "n" || key === "l") {
          try {
            e.preventDefault();
          } catch {}
          showNotification(`Shortcut ${isMac ? "Cmd" : "Ctrl"}+${e.key.toUpperCase()} is restricted.`);
          logEvent("restricted_shortcut_attempt", {
            key: e.key,
            shiftKey: e.shiftKey,
          });
          return;
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      showNotification("Copying is disabled during the exam.");
      logEvent("copy_attempt");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      showNotification("Pasting is disabled during the exam.");
      logEvent("paste_attempt");
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      showNotification("Cutting is disabled during the exam.");
      logEvent("cut_attempt");
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Prevent right-click context menu
      e.preventDefault();
      showNotification("Context menu is disabled during the exam.");
      logEvent("context_menu_attempt");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("cut", handleCut, true);
    document.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, [isEnabled, logEvent, showNotification]);

  return {
    isFullscreen,
    fullscreenState,
    fullscreenExitCount,
    requestFullscreen,
    isWindowFocused,
    windowLeftWarning,
    dismissWindowLeftWarning: () => setWindowLeftWarning(false),
    notification,
    dismissNotification,
    integrityAcknowledged,
    hasCompletedInitialNotice,
    acknowledgeAndEnterFullscreen,
    isNoticeDismissed: hasCompletedInitialNotice,
    dismissNotice: () => {
      integrityAcknowledgedRef.current = true;
      setIntegrityAcknowledged(true);
      setHasCompletedInitialNotice(true);
    },
    flushIntegrityEvents,
  };
}
