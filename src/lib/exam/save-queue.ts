"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { saveResponseAction } from "@/app/(student)/attempt/[attemptId]/actions";
import type { PendingExamResponse } from "@/lib/exam/constants";


export type SaveState = "idle" | "saving" | "saved" | "retrying" | "error";

export interface SaveStatus {
  state: SaveState;
  message?: string;
  failedQuestionIds: Set<string>;
}

export interface QueueItem {
  attemptId: string;
  questionId: string;
  payload: unknown;
  markedForReview: boolean;
  retries: number;
  version: number;
}

export class ExamSaveQueue {
  private queue: QueueItem[] = [];
  private inFlight: QueueItem | null = null;
  private isProcessing = false;
  private statusListeners: Set<(status: SaveStatus) => void> = new Set();
  private failedQuestionIds = new Set<string>();
  private currentState: SaveState = "idle";
  private currentMessage = "";
  private flushResolvers: Array<() => void> = [];
  private unconfirmed = new Map<string, QueueItem>();
  private nextVersion = 0;

  public getPendingResponses(): PendingExamResponse[] {
    return [...this.unconfirmed.values()].map(({ attemptId, questionId, payload, markedForReview }) => ({
      attemptId, questionId, payload, markedForReview,
    }));
  }

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleBeforeUnload);
      window.addEventListener("online", this.handleOnline);
    }
  }

  public destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.handleBeforeUnload);
      window.removeEventListener("online", this.handleOnline);
    }
    this.statusListeners.clear();
    this.flushResolvers = [];
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.unconfirmed.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  private handleOnline = () => {
    if (!this.isProcessing && this.queue.length > 0) {
      this.notify("retrying", "Connection restored - saving…");
      this.processNext();
    }
  };

  public hasPendingSaves(): boolean {
    return this.queue.length > 0 || this.inFlight !== null;
  }

  public subscribe(listener: (status: SaveStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public getStatus(): SaveStatus {
    return {
      state: this.currentState,
      message: this.currentMessage,
      failedQuestionIds: new Set(this.failedQuestionIds),
    };
  }

  private notify(state: SaveState, message = "") {
    this.currentState = state;
    this.currentMessage = message;
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => listener(status));
  }

  public enqueue(
    attemptId: string,
    questionId: string,
    payload: unknown,
    markedForReview: boolean
  ) {
    const version = ++this.nextVersion;
    const key = `${attemptId}:${questionId}`;
    this.unconfirmed.set(key, { attemptId, questionId, payload, markedForReview, retries: 0, version });
    // If question was previously failed, remove it upon new edit
    this.failedQuestionIds.delete(questionId);

    // Coalesce: if an item with the same questionId already exists in queue, update it in place
    const existingIndex = this.queue.findIndex(
      (item) => item.attemptId === attemptId && item.questionId === questionId
    );

    if (existingIndex !== -1) {
      this.queue[existingIndex].payload = payload;
      this.queue[existingIndex].markedForReview = markedForReview;
      this.queue[existingIndex].retries = 0;
      this.queue[existingIndex].version = version;
    } else {
      this.queue.push({
        attemptId,
        questionId,
        payload,
        markedForReview,
        retries: 0,
        version,
      });
    }

    if (!this.isProcessing) {
      this.processNext();
    }
  }

  private handleTransientFailure(item: QueueItem, errorMessage: string) {
    if (item.retries >= 8) {
      // Cap at 8 retries
      this.failedQuestionIds.add(item.questionId);
      this.notify("error", `Could not save after 8 attempts (${errorMessage}). Local answer preserved.`);
      this.inFlight = null;
      this.processNext();
      return;
    }

    item.retries += 1;
    const delay = Math.min(15000, 1000 * Math.pow(2, item.retries - 1)) * (0.75 + Math.random() * 0.5);
    this.notify("retrying", `Unsaved - retrying in ${Math.round(delay / 1000)}s…`);

    const coalescedIndex = this.queue.findIndex(
      (q) => q.attemptId === item.attemptId && q.questionId === item.questionId
    );
    if (coalescedIndex === -1) {
      this.queue.unshift(item);
    }

    this.inFlight = null;
    setTimeout(() => {
      this.processNext();
    }, delay);
  }

  private async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.inFlight = null;
      if (this.failedQuestionIds.size === 0) {
        this.notify("saved", "All changes saved");
      }
      this.checkFlushComplete();
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;
    this.inFlight = item;

    if (item.retries > 0) {
      this.notify("retrying", "Unsaved - retrying…");
    } else {
      this.notify("saving", "Saving…");
    }

    try {
      const res = await saveResponseAction(
        item.attemptId,
        item.questionId,
        item.payload,
        item.markedForReview
      );

      if (res.success) {
        const key = `${item.attemptId}:${item.questionId}`;
        if (this.unconfirmed.get(key)?.version === item.version) {
          this.unconfirmed.delete(key);
        }
        this.inFlight = null;
        this.failedQuestionIds.delete(item.questionId);
        this.processNext();
      } else {
        if (res.code === "TRANSIENT") {
          this.handleTransientFailure(item, res.message);
        } else {
          // Permanent failure: EXPIRED, UNAUTHORIZED, INVALID -> do NOT retry
          this.failedQuestionIds.add(item.questionId);
          this.notify("error", res.message || `Could not save (${res.code})`);
          this.inFlight = null;
          this.processNext();
        }
      }
    } catch (err: unknown) {
      // Network failure / unexpected error
      const msg = err instanceof Error ? err.message : "Network error";
      this.handleTransientFailure(item, msg);
    }
  }

  private checkFlushComplete() {
    if (!this.hasPendingSaves()) {
      const resolvers = [...this.flushResolvers];
      this.flushResolvers = [];
      resolvers.forEach((r) => r());
    }
  }

  public flush(timeoutMs = 10000): Promise<boolean> {
    if (!this.hasPendingSaves()) {
      return Promise.resolve(this.failedQuestionIds.size === 0);
    }

    return new Promise((resolve) => {
      let isTimedOut = false;
      const timer = setTimeout(() => {
        isTimedOut = true;
        resolve(!this.hasPendingSaves() && this.failedQuestionIds.size === 0);
      }, timeoutMs);

      this.flushResolvers.push(() => {
        if (!isTimedOut) {
          clearTimeout(timer);
          resolve(!this.hasPendingSaves() && this.failedQuestionIds.size === 0);
        }
      });
    });
  }
}

export function useExamSaveQueue() {
  const queue = useMemo(() => new ExamSaveQueue(), []);
  const [status, setStatus] = useState<SaveStatus>(() => queue.getStatus());

  useEffect(() => {
    const unsubscribe = queue.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => {
      unsubscribe();
      queue.destroy();
    };
  }, [queue]);

  const enqueue = useCallback(
    (attemptId: string, questionId: string, payload: unknown, markedForReview: boolean) => {
      queue.enqueue(attemptId, questionId, payload, markedForReview);
    },
    [queue]
  );

  const flush = useCallback(
    (timeoutMs?: number) => {
      return queue.flush(timeoutMs);
    },
    [queue]
  );

  const hasPendingSaves = useCallback(() => {
    return queue.hasPendingSaves();
  }, [queue]);

  return {
    queue,
    status,
    enqueue,
    flush,
    hasPendingSaves,
  };
}
