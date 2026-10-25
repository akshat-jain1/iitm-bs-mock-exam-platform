export const INTEGRITY_CONFIG = {
  // Counters threshold for Admin/TA activity status
  ATTENTION_THRESHOLD: 3,
  HIGH_ACTIVITY_THRESHOLD: 8,

  // Threshold for escalating the student fullscreen exit warning banner
  FULLSCREEN_WARNING_REPEAT_THRESHOLD: 3,

  // Minimum milliseconds between recording the same event type to avoid event spam
  EVENT_DEBOUNCE_MS: 2000,
} as const;

export type IntegrityEventType =
  | "fullscreen_exit"
  | "fullscreen_enter"
  | "visibility_lost"
  | "visibility_restored"
  | "window_blur"
  | "window_focus"
  | "copy_attempt"
  | "paste_attempt"
  | "cut_attempt"
  | "context_menu_attempt"
  | "restricted_shortcut_attempt";

export type IntegrityStatus = "Normal" | "Attention" | "High Activity";

export function getIntegrityStatus(totalEvents: number): IntegrityStatus {
  if (totalEvents >= INTEGRITY_CONFIG.HIGH_ACTIVITY_THRESHOLD) {
    return "High Activity";
  }
  if (totalEvents >= INTEGRITY_CONFIG.ATTENTION_THRESHOLD) {
    return "Attention";
  }
  return "Normal";
}
