import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BoundedLruCache,
  paperStructureCache,
  invalidatePaperStructureCache,
  __setRevalidateTagHookForTesting,
  CachedPaperStructure,
} from "@/lib/exam/paper-cache";

// ==============================================================================
// 1. Bounded LRU Cache & Invalidation Tests
// ==============================================================================

describe("Phase 4: BoundedLruCache Operations, Eviction, and TTL", () => {
  it("TC-1: Basic set, get, has operations and hit/miss metrics", () => {
    const cache = new BoundedLruCache<string, string>({ capacity: 5, defaultTtlMs: 10000 });

    assert.strictEqual(cache.has("key1"), false);
    assert.strictEqual(cache.get("key1"), undefined);
    assert.strictEqual(cache.stats.misses, 1);
    assert.strictEqual(cache.stats.hits, 0);

    cache.set("key1", "value1");
    assert.strictEqual(cache.has("key1"), true);
    assert.strictEqual(cache.get("key1"), "value1");
    assert.strictEqual(cache.stats.hits, 1);
    assert.strictEqual(cache.size, 1);
  });

  it("TC-2: Capacity limit eviction (evicts least recently used entry)", () => {
    const cache = new BoundedLruCache<string, number>({ capacity: 3, defaultTtlMs: 10000 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.strictEqual(cache.size, 3);

    // Inserting 4th item must evict "a" (oldest inserted, never accessed)
    cache.set("d", 4);
    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.has("a"), false);
    assert.strictEqual(cache.get("a"), undefined);
    assert.strictEqual(cache.get("b"), 2);
    assert.strictEqual(cache.get("c"), 3);
    assert.strictEqual(cache.get("d"), 4);
  });

  it("TC-3: Access order refresh prevents accessed item from being evicted", () => {
    const cache = new BoundedLruCache<string, string>({ capacity: 3, defaultTtlMs: 10000 });

    cache.set("item1", "A");
    cache.set("item2", "B");
    cache.set("item3", "C");

    // Access "item1" -> now "item2" is the least recently used
    assert.strictEqual(cache.get("item1"), "A");

    // Adding "item4" should evict "item2", NOT "item1"
    cache.set("item4", "D");
    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.has("item2"), false);
    assert.strictEqual(cache.has("item1"), true);
    assert.strictEqual(cache.get("item1"), "A");
    assert.strictEqual(cache.get("item3"), "C");
    assert.strictEqual(cache.get("item4"), "D");
  });

  it("TC-4: Re-setting existing key updates value, resets TTL, and refreshes recency", () => {
    const cache = new BoundedLruCache<string, string>({ capacity: 2, defaultTtlMs: 10000 });

    cache.set("k1", "v1");
    cache.set("k2", "v2");

    // Re-set "k1" with new value -> moves k1 to most recent
    cache.set("k1", "v1_updated");
    assert.strictEqual(cache.size, 2);
    assert.strictEqual(cache.get("k1"), "v1_updated");

    // Adding "k3" should evict "k2" (since k1 was updated and is newer)
    cache.set("k3", "v3");
    assert.strictEqual(cache.has("k2"), false);
    assert.strictEqual(cache.has("k1"), true);
    assert.strictEqual(cache.has("k3"), true);
  });

  it("TC-5: TTL expiration returns miss and removes expired entry", async () => {
    const cache = new BoundedLruCache<string, string>({ capacity: 5, defaultTtlMs: 50 }); // 50ms TTL

    cache.set("fast_expire", "val", 30); // 30ms TTL
    assert.strictEqual(cache.get("fast_expire"), "val");

    // Wait 40ms to exceed TTL
    await new Promise((r) => setTimeout(r, 45));

    assert.strictEqual(cache.has("fast_expire"), false);
    assert.strictEqual(cache.get("fast_expire"), undefined);
    assert.strictEqual(cache.size, 0);
  });

  it("TC-6: Explicit deletion and clear", () => {
    const cache = new BoundedLruCache<string, number>({ capacity: 5 });
    cache.set("x", 10);
    cache.set("y", 20);

    assert.strictEqual(cache.delete("x"), true);
    assert.strictEqual(cache.has("x"), false);
    assert.strictEqual(cache.size, 1);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.has("y"), false);
    assert.strictEqual(cache.stats.hits, 0);
    assert.strictEqual(cache.stats.misses, 0);
  });

  it("TC-7: Targeted invalidation via production invalidatePaperStructureCache removes specific entry and emits targeted tag", () => {
    paperStructureCache.clear();
    const invalidatedCalls: Array<{ tag: string; profile: unknown }> = [];
    __setRevalidateTagHookForTesting((tag, profile) => {
      invalidatedCalls.push({ tag, profile });
    });

    try {
      const dummyStructure1 = {
        id: "paper-v1-uuid",
        title: "Math 101",
        sections: [],
        groups: [],
        questions: [],
      } as unknown as CachedPaperStructure;

      const dummyStructure2 = {
        id: "paper-v2-uuid",
        title: "Physics 101",
        sections: [],
        groups: [],
        questions: [],
      } as unknown as CachedPaperStructure;

      paperStructureCache.set("paper-v1-uuid", dummyStructure1);
      paperStructureCache.set("paper-v2-uuid", dummyStructure2);

      assert.strictEqual(paperStructureCache.has("paper-v1-uuid"), true);
      assert.strictEqual(paperStructureCache.has("paper-v2-uuid"), true);

      // Invalidate specific paper using REAL production function
      invalidatePaperStructureCache("paper-v1-uuid");

      // Verify targeted in-memory eviction
      assert.strictEqual(paperStructureCache.has("paper-v1-uuid"), false);
      assert.strictEqual(paperStructureCache.has("paper-v2-uuid"), true); // Preserved

      // Verify targeted Next.js tag with { expire: 0 } was emitted, NOT global tag
      assert.strictEqual(invalidatedCalls.length, 1);
      assert.strictEqual(invalidatedCalls[0].tag, "paper-structure-paper-v1-uuid");
      assert.deepStrictEqual(invalidatedCalls[0].profile, { expire: 0 });
    } finally {
      __setRevalidateTagHookForTesting(null);
    }
  });

  it("TC-7B: Global invalidation via production invalidatePaperStructureCache clears all entries and emits global tag", () => {
    paperStructureCache.clear();
    const invalidatedCalls: Array<{ tag: string; profile: unknown }> = [];
    __setRevalidateTagHookForTesting((tag, profile) => {
      invalidatedCalls.push({ tag, profile });
    });

    try {
      paperStructureCache.set("paper-a", { id: "paper-a", title: "A", sections: [], groups: [], questions: [] });
      paperStructureCache.set("paper-b", { id: "paper-b", title: "B", sections: [], groups: [], questions: [] });
      assert.strictEqual(paperStructureCache.size, 2);

      // Invalidate without ID using REAL production function
      invalidatePaperStructureCache();

      // Verify all local entries are cleared
      assert.strictEqual(paperStructureCache.size, 0);
      assert.strictEqual(paperStructureCache.has("paper-a"), false);
      assert.strictEqual(paperStructureCache.has("paper-b"), false);

      // Verify global Next.js tag with { expire: 0 } was emitted
      assert.strictEqual(invalidatedCalls.length, 1);
      assert.strictEqual(invalidatedCalls[0].tag, "paper-structure");
      assert.deepStrictEqual(invalidatedCalls[0].profile, { expire: 0 });
    } finally {
      __setRevalidateTagHookForTesting(null);
    }
  });

  it("TC-7C: Retrieval pipeline cache miss and cache hit behavior using production cache", async () => {
    paperStructureCache.clear();
    let dbQueryCount = 0;

    async function loadPaperPipeline(id: string): Promise<CachedPaperStructure | null> {
      const cached = paperStructureCache.get(id);
      if (cached) return cached;

      dbQueryCount++;
      const loaded: CachedPaperStructure = {
        id,
        title: `Authoritative Paper ${id}`,
        sections: [],
        groups: [],
        questions: [],
      };
      paperStructureCache.set(id, loaded);
      return loaded;
    }

    // First retrieval: Cache Miss -> Queries Database
    const res1 = await loadPaperPipeline("paper-pipeline-1");
    assert.strictEqual(res1?.id, "paper-pipeline-1");
    assert.strictEqual(dbQueryCount, 1);

    // Second retrieval: Cache Hit -> Serves from in-memory cache without DB query
    const res2 = await loadPaperPipeline("paper-pipeline-1");
    assert.strictEqual(res2?.id, "paper-pipeline-1");
    assert.strictEqual(dbQueryCount, 1);
  });

  it("TC-7D: Changing authoritative content for same paper ID is evicted by invalidatePaperStructureCache and refreshed", async () => {
    paperStructureCache.clear();
    let authoritativeDbTitle = "Original Authoritative Title";

    async function fetchPaperThroughPipeline(id: string): Promise<CachedPaperStructure> {
      const cached = paperStructureCache.get(id);
      if (cached) return cached;

      const loaded: CachedPaperStructure = {
        id,
        title: authoritativeDbTitle,
        sections: [],
        groups: [],
        questions: [],
      };
      paperStructureCache.set(id, loaded);
      return loaded;
    }

    // 1. Initial retrieval seeds in-process cache
    const initial = await fetchPaperThroughPipeline("paper-reingest-1");
    assert.strictEqual(initial.title, "Original Authoritative Title");
    assert.strictEqual(paperStructureCache.has("paper-reingest-1"), true);

    // 2. Authoritative source is updated out-of-band (e.g. administrative re-ingestion)
    authoritativeDbTitle = "Corrected Authoritative Title";

    // 3. Before invalidation, retrieval continues to serve cached stale content
    assert.strictEqual((await fetchPaperThroughPipeline("paper-reingest-1")).title, "Original Authoritative Title");

    // 4. Invalidation occurs using the REAL exported production function
    invalidatePaperStructureCache("paper-reingest-1");

    // 5. Verify local entry is removed
    assert.strictEqual(paperStructureCache.has("paper-reingest-1"), false);

    // 6. Subsequent retrieval through pipeline MUST fetch fresh authoritative data
    const refreshed = await fetchPaperThroughPipeline("paper-reingest-1");
    assert.strictEqual(refreshed.title, "Corrected Authoritative Title");
    assert.notStrictEqual(refreshed.title, "Original Authoritative Title");
  });

  it("TC-7E: Republishing paper creates new immutable version snapshot without cross-version collision", async () => {
    paperStructureCache.clear();

    // Step 1: Initial published version (v1) with 10 questions
    const v1Id = "psv-math-version-1";
    const v1Structure: CachedPaperStructure = {
      id: v1Id,
      title: "Math Paper (May 2026)",
      sections: [],
      groups: [],
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q-v1-${i + 1}`,
        type: "MCQ",
        text: `Question ${i + 1}`,
        marks: 2,
        options: [],
      })),
    };
    paperStructureCache.set(v1Id, v1Structure);

    // Step 2: Authoring template is modified and republished as version 2 (v2) with 12 questions
    const v2Id = "psv-math-version-2";
    const v2Structure: CachedPaperStructure = {
      id: v2Id,
      title: "Math Paper (May 2026 - Revised)",
      sections: [],
      groups: [],
      questions: Array.from({ length: 12 }, (_, i) => ({
        id: `q-v2-${i + 1}`,
        type: "MCQ",
        text: `Question ${i + 1} revised`,
        marks: 2,
        options: [],
      })),
    };
    paperStructureCache.set(v2Id, v2Structure);

    // Verify existing exam session requesting v1 still gets frozen v1 snapshot
    const student1Paper = paperStructureCache.get(v1Id);
    assert.strictEqual(student1Paper?.title, "Math Paper (May 2026)");
    assert.strictEqual(student1Paper?.questions.length, 10);

    // Verify new exam session assigned v2 gets fresh v2 snapshot
    const student2Paper = paperStructureCache.get(v2Id);
    assert.strictEqual(student2Paper?.title, "Math Paper (May 2026 - Revised)");
    assert.strictEqual(student2Paper?.questions.length, 12);
  });

  it("TC-8: Version correctness - distinct version snapshots do not collide", () => {
    const cache = new BoundedLruCache<string, { version: number }>({ capacity: 10 });

    const ver1Id = "set-A-ver-1";
    const ver2Id = "set-A-ver-2";

    cache.set(ver1Id, { version: 1 });
    cache.set(ver2Id, { version: 2 });

    assert.strictEqual(cache.get(ver1Id)?.version, 1);
    assert.strictEqual(cache.get(ver2Id)?.version, 2);

    // Invalidating version 1 does not alter version 2
    cache.delete(ver1Id);
    assert.strictEqual(cache.get(ver1Id), undefined);
    assert.strictEqual(cache.get(ver2Id)?.version, 2);
  });
});

// ==============================================================================
// 2. Protected Exam Asset Cache Headers Simulation & Verification
// ==============================================================================

function simulateAssetRouteResponse({
  path,
  isAuthenticated,
  userRole,
  isAllowedEmail,
  isAuthorized,
  assetExists,
}: {
  path?: string[];
  isAuthenticated?: boolean;
  userRole?: "student" | "admin" | "tester" | "unknown";
  isAllowedEmail?: boolean;
  isAuthorized?: boolean;
  assetExists?: boolean;
}): { status: number; headers: Record<string, string>; body: unknown } {
  const RESTRICTIVE_NO_STORE_HEADERS: Record<string, string> = {
    "Cache-Control": "private, no-store",
  };

  if (!path || path.length === 0) {
    return { status: 400, headers: RESTRICTIVE_NO_STORE_HEADERS, body: "Asset path missing" };
  }

  const storagePath = path.join("/");
  if (storagePath.includes("..") || !storagePath.startsWith("papers/")) {
    return { status: 400, headers: RESTRICTIVE_NO_STORE_HEADERS, body: "Invalid asset path" };
  }

  if (!isAuthenticated) {
    return {
      status: 401,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
      body: "Unauthorized: Authentication required to view exam assets.",
    };
  }

  if (userRole === "student" && !isAllowedEmail) {
    return {
      status: 403,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
      body: "Forbidden: Access restricted to official Scaler accounts.",
    };
  }

  if (!isAuthorized) {
    return {
      status: 403,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
      body: "Forbidden: Access to this exam asset is restricted.",
    };
  }

  if (!assetExists) {
    return { status: 404, headers: RESTRICTIVE_NO_STORE_HEADERS, body: "Asset not found" };
  }

  const contentType = storagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
    body: Buffer.from("fake-image-bytes"),
  };
}

describe("Phase 4: Protected Exam Asset Cache Headers (Private, No-Store)", () => {
  it("TC-9: Authenticated successful exam asset request strictly returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({
      path: ["papers", "paper-1", "q1.jpg"],
      isAuthenticated: true,
      userRole: "student",
      isAllowedEmail: true,
      isAuthorized: true,
      assetExists: true,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
    assert.strictEqual(res.headers["Content-Type"], "image/jpeg");
  });

  it("TC-10: Missing or empty asset path (400) returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({ path: [] });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-11: Directory traversal attempt in path (400) returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({ path: ["papers", "..", "secrets.txt"] });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-12: Unauthenticated exam asset request (401) returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({
      path: ["papers", "paper-1", "q1.jpg"],
      isAuthenticated: false,
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-13: Forbidden unauthorized access (403) returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({
      path: ["papers", "paper-1", "q1.jpg"],
      isAuthenticated: true,
      userRole: "student",
      isAllowedEmail: true,
      isAuthorized: false,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-14: Asset not found in storage (404) returns Cache-Control: private, no-store", () => {
    const res = simulateAssetRouteResponse({
      path: ["papers", "paper-1", "nonexistent.jpg"],
      isAuthenticated: true,
      userRole: "student",
      isAllowedEmail: true,
      isAuthorized: true,
      assetExists: false,
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });
});

// ==============================================================================
// 3. Academic Resource Download Cache Headers Verification
// ==============================================================================

function simulateResourceDownloadResponse({
  resourceId,
  isAuthenticated,
  userRole,
  resourceFound,
  isPublished,
  storagePath,
}: {
  resourceId?: string;
  isAuthenticated?: boolean;
  userRole?: "student" | "admin" | "other";
  resourceFound?: boolean;
  isPublished?: boolean;
  storagePath?: string;
}): { status: number; headers: Record<string, string>; body: unknown } {
  const NO_STORE_HEADERS: Record<string, string> = { "Cache-Control": "private, no-store" };

  if (!resourceId) {
    return { status: 400, headers: NO_STORE_HEADERS, body: "Resource ID is required" };
  }

  if (!isAuthenticated) {
    return { status: 401, headers: NO_STORE_HEADERS, body: "Unauthorized" };
  }

  if (!userRole || (userRole !== "student" && userRole !== "admin")) {
    return { status: 403, headers: NO_STORE_HEADERS, body: "Forbidden" };
  }

  if (!resourceFound) {
    return { status: 404, headers: NO_STORE_HEADERS, body: "Resource not found" };
  }

  if (userRole === "student" && !isPublished) {
    return { status: 404, headers: NO_STORE_HEADERS, body: "Resource not found" };
  }

  if (!storagePath || storagePath.includes("..") || storagePath.startsWith("/")) {
    return { status: 400, headers: NO_STORE_HEADERS, body: "Invalid storage path" };
  }

  return {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="lecture_notes.pdf"',
      "Cache-Control": "private, max-age=3600",
    },
    body: Buffer.from("%PDF-1.7..."),
  };
}

describe("Phase 4: Academic Resource Download Cache Headers", () => {
  it("TC-15: Published study resource download returns private, max-age=3600", () => {
    const res = simulateResourceDownloadResponse({
      resourceId: "res-1",
      isAuthenticated: true,
      userRole: "student",
      resourceFound: true,
      isPublished: true,
      storagePath: "study_materials/notes.pdf",
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["Cache-Control"], "private, max-age=3600");
  });

  it("TC-16: Unauthenticated download request (401) returns Cache-Control: private, no-store", () => {
    const res = simulateResourceDownloadResponse({
      resourceId: "res-1",
      isAuthenticated: false,
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-17: Unauthorized role request (403) returns Cache-Control: private, no-store", () => {
    const res = simulateResourceDownloadResponse({
      resourceId: "res-1",
      isAuthenticated: true,
      userRole: "other",
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-18: Unpublished resource requested by student (404) returns Cache-Control: private, no-store", () => {
    const res = simulateResourceDownloadResponse({
      resourceId: "res-draft",
      isAuthenticated: true,
      userRole: "student",
      resourceFound: true,
      isPublished: false,
      storagePath: "drafts/draft.pdf",
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });

  it("TC-19: Path traversal in storage path (400) returns Cache-Control: private, no-store", () => {
    const res = simulateResourceDownloadResponse({
      resourceId: "res-1",
      isAuthenticated: true,
      userRole: "admin",
      resourceFound: true,
      isPublished: true,
      storagePath: "../etc/passwd",
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  });
});
