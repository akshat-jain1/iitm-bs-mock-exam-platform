/**
 * Feedback Centre Submission Rate Limiting & Anti-Abuse
 * 
 * Architecture:
 * - Tier 1 (Process-local fast-path): In-process debounce and throttle to immediately reject rapid repeat clicks.
 * - Tier 2 (Authoritative Database Engine): PostgreSQL atomic advisory transaction locks (`pg_advisory_xact_lock`)
 *   and windowed count queries in `submit_student_feedback_v1` that serialize concurrent requests across
 *   independent Vercel serverless instances, eliminating race conditions without requiring external Redis.
 */

export interface RecentSubmissionRecord {
  timestamp: number;
  titleHash: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
}

export const DEBOUNCE_WINDOW_MS = 60 * 1000; // 60 seconds
export const BURST_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
export const HOUR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const DAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export const MAX_BURST_SUBMISSIONS = 3;
export const MAX_SUBMISSIONS_PER_HOUR = 10;
export const MAX_SUBMISSIONS_PER_DAY = 30;

export function hashTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Shared rate limiter store interface.
 * Implemented by database queries in production, or in-memory stores for tests and fast-pathing.
 */
export interface RateLimitStore {
  getUserSubmissions(userId: string): RecentSubmissionRecord[];
  addUserSubmission(userId: string, record: RecentSubmissionRecord): void;
  clear(): void;
}

/**
 * In-memory shared store for testing multi-instance scenarios and process-local cache.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, RecentSubmissionRecord[]>();

  getUserSubmissions(userId: string): RecentSubmissionRecord[] {
    return this.map.get(userId) || [];
  }

  addUserSubmission(userId: string, record: RecentSubmissionRecord): void {
    const list = this.map.get(userId) || [];
    list.push(record);
    this.map.set(userId, list);
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Stateful RateLimiter class.
 * Allows independent limiter instances (simulating separate Vercel lambdas)
 * to share a common storage layer and test concurrent execution.
 */
export class SharedRateLimiter {
  constructor(private store: RateLimitStore) {}

  /**
   * Evaluates windowed rate limits against the store.
   */
  checkRateLimit(
    userId: string,
    title: string,
    now: number = Date.now()
  ): RateLimitCheckResult {
    const userRecords = this.store.getUserSubmissions(userId);
    const normalizedTitle = hashTitle(title);

    // Prune entries older than 24 hours
    const validRecords = userRecords.filter((r) => now - r.timestamp < DAY_WINDOW_MS);

    // 1. Rapid Duplicate Check (same normalized title within 60 seconds)
    const recentDuplicate = validRecords.find(
      (r) => now - r.timestamp < DEBOUNCE_WINDOW_MS && r.titleHash === normalizedTitle
    );
    if (recentDuplicate) {
      return {
        allowed: false,
        reason: 'A submission with this title was already received just now. Please wait a moment before resubmitting.',
      };
    }

    // 2. Short-burst throttle (max 3 submissions within 2 minutes)
    const burst2m = validRecords.filter((r) => now - r.timestamp < BURST_WINDOW_MS);
    if (burst2m.length >= MAX_BURST_SUBMISSIONS) {
      return {
        allowed: false,
        reason: 'You are submitting feedback too quickly. Please pause for a few minutes.',
      };
    }

    // 3. Hourly limit
    const hourRecords = validRecords.filter((r) => now - r.timestamp < HOUR_WINDOW_MS);
    if (hourRecords.length >= MAX_SUBMISSIONS_PER_HOUR) {
      return {
        allowed: false,
        reason: `You have reached the hourly submission limit (${MAX_SUBMISSIONS_PER_HOUR} items). Please wait before submitting more feedback.`,
      };
    }

    // 4. Daily limit
    if (validRecords.length >= MAX_SUBMISSIONS_PER_DAY) {
      return {
        allowed: false,
        reason: `You have reached the daily submission limit (${MAX_SUBMISSIONS_PER_DAY} items). Please wait before submitting more feedback.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Records a submission into the shared store.
   */
  recordSubmission(userId: string, title: string, now: number = Date.now()): void {
    this.store.addUserSubmission(userId, {
      timestamp: now,
      titleHash: hashTitle(title),
    });
  }

  /**
   * Atomic check-and-record operation simulating an advisory-locked database transaction.
   * If allowed, atomically records the submission and returns allowed: true.
   */
  checkAndRecord(userId: string, title: string, now: number = Date.now()): RateLimitCheckResult {
    const check = this.checkRateLimit(userId, title, now);
    if (!check.allowed) {
      return check;
    }
    this.recordSubmission(userId, title, now);
    return { allowed: true };
  }
}

// Global default process-local store and limiter
const defaultStore = new InMemoryRateLimitStore();
const defaultLimiter = new SharedRateLimiter(defaultStore);

/**
 * Checks in-memory debounce and hourly limits for a given user.
 */
export function checkInMemoryRateLimit(
  userId: string,
  title: string,
  now: number = Date.now()
): RateLimitCheckResult {
  return defaultLimiter.checkRateLimit(userId, title, now);
}

/**
 * Records a successful submission in the default tracker.
 */
export function recordSubmission(
  userId: string,
  title: string,
  now: number = Date.now()
): void {
  defaultLimiter.recordSubmission(userId, title, now);
}

/**
 * Clears the default tracker (used in automated unit testing).
 */
export function __clearRateLimitTrackerForTesting(): void {
  defaultStore.clear();
}
